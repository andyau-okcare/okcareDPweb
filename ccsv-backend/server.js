const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const requiredDbConfig = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingDbConfig = requiredDbConfig.filter(key => !process.env[key]);
if (missingDbConfig.length > 0) {
    throw new Error(`Missing required database configuration: ${missingDbConfig.join(', ')}`);
}
const dbConfig = Object.fromEntries(
    requiredDbConfig.map(key => [key, process.env[key].replace(/\r/g, '')])
);

const copayRates = {
    'Cat I': 5,
    'Cat II': 8,
    'Cat III': 12,
    'Cat IV': 16,
    'Cat V': 25,
    'Cat VI': 40
};

const formatCopayTier = (value) => {
    if (typeof value === 'string' && value.startsWith('Cat ')) return value;
    const rate = Number(value);
    const match = Object.entries(copayRates).find(([, percentage]) =>
        Math.abs(rate - percentage) < 0.0001 || Math.abs(rate * 100 - percentage) < 0.0001
    );
    return match ? match[0] : value || 'Cat I';
};

const pool = mysql.createPool({
    host: dbConfig.DB_HOST,
    port: Number(dbConfig.DB_PORT),
    user: dbConfig.DB_USER,
    password: dbConfig.DB_PASSWORD,
    database: dbConfig.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

const defaultBasicSettings = {
    normalStart: '09:00',
    normalEnd: '18:00',
    services: [
        { code: 'PT', name: 'PT', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'OT', name: 'OT', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'ST', name: 'ST', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'RN', name: 'RN', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'EN', name: 'EN', serviceProfessional: '專業人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'PTA', name: 'PTA', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'OTA', name: 'OTA', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'PCW', name: 'PCW', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'HW', name: 'HW', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false },
        { code: 'HP', name: 'HP', serviceProfessional: '輔助人員', serviceFee: 0, caregiverFee: 0, mealIncluded: false }
    ],
    caregivers: [],
    mealCaregivers: [],
    holidays: []
};

const isTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
const timeMinutes = value => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
};
const isDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};
const normalizeMealOptions = (body, service) => {
    const mealService = /meal|膳食|送餐|food service/i.test(`${service.code} ${service.name}`);
    const mealCount = body.mealCount === undefined ? 1 : body.mealCount;
    const softMeal = body.softMeal === undefined ? false : body.softMeal;
    if (!Number.isInteger(mealCount) || mealCount < 1 || mealCount > 3 ||
        typeof softMeal !== 'boolean') return null;
    return {
        mealCount: mealService ? mealCount : null,
        softMeal: mealService && softMeal
    };
};
const isDurationPricedService = serviceCode => ['PCW', 'HW'].includes(String(serviceCode || '').toUpperCase());
const defaultDurationFees = () => Array.from({ length: 14 }, (_, index) => ({
    hours: index + 1,
    serviceFee: 0,
    caregiverFee: 0
}));
const groupDurationFees = rows => {
    const grouped = new Map();
    for (const row of rows) {
        const code = String(row.code).toUpperCase();
        if (!grouped.has(code)) grouped.set(code, defaultDurationFees());
        const hours = Number(row.hours);
        if (hours >= 1 && hours <= 14 && Number.isInteger(hours)) {
            grouped.get(code)[hours - 1] = {
                hours,
                serviceFee: Number(row.serviceFee),
                caregiverFee: Number(row.caregiverFee || 0)
            };
        }
    }
    return grouped;
};
const normalizeBookingTimes = (body, service) => {
    const rawStartTime = String(body && body.startTime || '').replace('T', ' ');
    const rawEndTime = String(body && body.endTime || '').replace('T', ' ');
    if (/meal|膳食|送餐|food service/i.test(`${service.code} ${service.name}`)) {
        const date = body && typeof body.date === 'string' && body.date
            ? body.date
            : rawStartTime.slice(0, 10);
        if (!isDate(date)) return null;
        return { startTime: `${date} 00:00:00`, endTime: `${date} 00:00:00` };
    }

    const dateTimePattern = /^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
    const parseDateTime = value => {
        if (!dateTimePattern.test(value)) return Number.NaN;
        const [date, time] = value.split(' ');
        if (!isDate(date)) return Number.NaN;
        const [year, month, day] = date.split('-').map(Number);
        const [hour, minute, second] = time.split(':').map(Number);
        return Date.UTC(year, month - 1, day, hour, minute, second);
    };
    const startMs = parseDateTime(rawStartTime);
    const endMs = parseDateTime(rawEndTime);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
    return { startTime: rawStartTime, endTime: rawEndTime };
};

const authorizeBasicSettings = (req, res) => {
    const expected = process.env.BASIC_SETTINGS_KEY || '1234';
    const supplied = req.get('X-Basic-Settings-Key') || '';
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
        res.status(401).json({ error: 'Invalid Basic settings key.' });
        return false;
    }
    return true;
};

const validateBasicSettings = body => {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !isTime(body.normalStart) || !isTime(body.normalEnd) ||
        timeMinutes(body.normalStart) >= timeMinutes(body.normalEnd) ||
        !Array.isArray(body.services) || !body.services.length ||
        !Array.isArray(body.caregivers) ||
        (body.mealCaregivers !== undefined && !Array.isArray(body.mealCaregivers)) ||
        !Array.isArray(body.holidays)) {
        return 'Basic settings have an invalid structure or normal service time.';
    }
    const serviceNames = new Set();
    const serviceCodes = new Set();
    for (const service of body.services) {
        if (!service || typeof service.code !== 'string' || !service.code.trim() || service.code.trim().length > 20 ||
            typeof service.name !== 'string' || !service.name.trim() || service.name.trim().length > 120 ||
            (service.serviceProfessional !== undefined &&
                (typeof service.serviceProfessional !== 'string' || service.serviceProfessional.trim().length > 120)) ||
            !Number.isFinite(Number(service.serviceFee)) || Number(service.serviceFee) < 0 ||
            !Number.isFinite(Number(service.caregiverFee)) || Number(service.caregiverFee) < 0 ||
            typeof service.mealIncluded !== 'boolean') {
            return 'Each service needs a code, name, non-negative service and caregiver fees, and meal setting.';
        }
        if (serviceNames.has(service.name.trim())) return 'Service names must be unique.';
        if (serviceCodes.has(service.code.trim().toUpperCase())) return 'Service codes must be unique.';
        serviceNames.add(service.name.trim());
        const code = service.code.trim().toUpperCase();
        serviceCodes.add(code);
        if (isDurationPricedService(code)) {
            if (!Array.isArray(service.durationFees) || service.durationFees.length !== 14) {
                return `${code} needs a service fee and caregiver fee for each duration from 1 to 14 hours.`;
            }
            const durations = new Set();
            for (const tier of service.durationFees) {
                if (!tier || !Number.isInteger(tier.hours) || tier.hours < 1 || tier.hours > 14 ||
                    durations.has(tier.hours) ||
                    !Number.isFinite(Number(tier.serviceFee)) || Number(tier.serviceFee) < 0 ||
                    !Number.isFinite(Number(tier.caregiverFee)) || Number(tier.caregiverFee) < 0) {
                    return `${code} duration fees need unique 1–14 hour rows with non-negative service and caregiver fees.`;
                }
                durations.add(tier.hours);
            }
            if (durations.size !== 14) return `${code} needs all duration fee rows from 1 to 14 hours.`;
        }
    }
    const caregiverCodes = new Set();
    for (const caregiver of body.caregivers) {
        if (!caregiver || typeof caregiver.code !== 'string' || !caregiver.code.trim() ||
            caregiver.code.trim().length > 50 ||
            typeof caregiver.name !== 'string' || !caregiver.name.trim() || caregiver.name.trim().length > 150 ||
            !Number.isFinite(Number(caregiver.hourlyFee)) || Number(caregiver.hourlyFee) < 0) {
            return 'Each caregiver needs a code (up to 50 characters), name (up to 150 characters), and non-negative hourly fee.';
        }
        const code = caregiver.code.trim().toUpperCase();
        if (caregiverCodes.has(code)) return 'Caregiver codes must be unique.';
        caregiverCodes.add(code);
    }
    const mealCaregiverCodes = new Set();
    for (const caregiver of body.mealCaregivers || []) {
        if (!caregiver || typeof caregiver.code !== 'string' || !caregiver.code.trim() ||
            caregiver.code.trim().length > 50 ||
            typeof caregiver.name !== 'string' || !caregiver.name.trim() || caregiver.name.trim().length > 150) {
            return 'Each meal caregiver needs a code (up to 50 characters) and name (up to 150 characters).';
        }
        const code = caregiver.code.trim().toUpperCase();
        if (mealCaregiverCodes.has(code)) return 'Meal caregiver codes must be unique.';
        mealCaregiverCodes.add(code);
    }
    if (!body.holidays.every(isDate)) return 'Holiday dates must use YYYY-MM-DD format.';
    return null;
};

console.log(`MariaDB target: ${dbConfig.DB_HOST}:${dbConfig.DB_PORT}`);

// Test DB Connection on startup
pool.getConnection((err, connection) => {
    if (err) {
        console.error(`❌ Database connection failed for ${dbConfig.DB_HOST}:${dbConfig.DB_PORT}:`, err.message);
    } else {
        console.log(`✅ Connected to MariaDB successfully on port ${dbConfig.DB_PORT}!`);
        connection.release();
    }
});

// GET: Fetch all clients
app.get('/api/clients', (req, res) => {
    pool.query('SELECT * FROM clients', (err, results) => {
        if (err) {
            console.error('❌ SQL Error on /api/clients:', err.message);
            return res.status(500).json({ error: err.message });
        }
        
        const formatted = (results || []).map(c => ({
            id: c.id,
            clientId: c.client_id || c.id || '',
            patientId: c.patient_id || '',
            voucherNo: c.ccsv_number || c.voucher_no || '',
            hkid: c.hkid || '',
            nameCn: c.chinese_name || c.name_cn || '',
            nameEn: c.english_name || c.name_en || '',
            copayTier: formatCopayTier(
                c.co_payment_percentage !== undefined && c.co_payment_percentage !== null
                    ? c.co_payment_percentage
                    : c.copay_tier
            ),
            adminClientName: c.admin_client_name || '',
            district: c.service_district || c.district || '',
            address: c.address || '',
            telephone: c.telephone || '',
            pic: c.pic || '',
            status: c.status || 'Active',
        }));
        res.json(formatted);
    });
});

// POST: Add a client using the clients table's required data fields
app.post('/api/clients', (req, res) => {
    const fields = [
        { key: 'clientId', columns: ['client_id'] },
        { key: 'patientId', columns: ['patient_id'] },
        { key: 'voucherNo', columns: ['ccsv_number'] },
        { key: 'hkid', columns: ['hkid'] },
        { key: 'nameCn', columns: ['chinese_name'] },
        { key: 'nameEn', columns: ['english_name'] },
        { key: 'copayTier', columns: ['co_payment_percentage'] },
        { key: 'adminClientName', columns: ['admin_client_name'] },
        { key: 'district', columns: ['service_district'] },
        { key: 'address', columns: ['address'] },
        { key: 'telephone', columns: ['telephone'] },
        { key: 'pic', columns: ['pic'] }
    ];
    const requiredKeys = fields.filter(field => field.key !== 'pic').map(field => field.key);
    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Client details must be provided as an object.' });
    }

    const valuesByKey = {};
    for (const { key } of fields) {
        const value = body[key];
        if (value !== undefined && value !== null && typeof value !== 'string') {
            return res.status(400).json({ error: `${key} must be a string.` });
        }
        valuesByKey[key] = typeof value === 'string' ? value.trim() : (key === 'pic' ? 'ET' : '');
    }

    const missingKeys = requiredKeys.filter(key => !valuesByKey[key]);
    if (missingKeys.length > 0) {
        return res.status(400).json({ error: 'All client fields are required.' });
    }
    if (!/^P\d{8}$/.test(valuesByKey.clientId)) {
        return res.status(400).json({ error: 'Client ID must use the format P followed by 8 digits.' });
    }
    if (!new RegExp(`^${valuesByKey.clientId}-\\d{4}$`).test(valuesByKey.patientId)) {
        return res.status(400).json({ error: 'Patient ID must be the client ID followed by a hyphen and 4 digits.' });
    }
    if (!/^CCSV-\d{6}$/.test(valuesByKey.voucherNo)) {
        return res.status(400).json({ error: 'Voucher number must use the format CCSV- followed by 6 digits.' });
    }
    if (!Object.prototype.hasOwnProperty.call(copayRates, valuesByKey.copayTier)) {
        return res.status(400).json({ error: 'Invalid co-payment option.' });
    }
    if (valuesByKey.pic.length > 50) {
        return res.status(400).json({ error: 'PIC must be 50 characters or fewer.' });
    }

    pool.query('SHOW COLUMNS FROM clients', (schemaErr, schema) => {
        if (schemaErr) {
            console.error('SQL Error reading clients schema:', schemaErr.message);
            return res.status(500).json({ error: 'Unable to inspect the clients table.' });
        }

        const availableColumns = new Set(schema.map(column => column.Field));
        const insertFields = [];
        const insertValues = [];

        for (const { key, columns } of fields) {
            const value = valuesByKey[key];
            const column = columns.find(candidate => availableColumns.has(candidate));
            if (!column) {
                return res.status(500).json({ error: `The clients table is missing the required ${columns[0]} column.` });
            }
            insertFields.push(`\`${column}\``);
            insertValues.push(key === 'copayTier' ? copayRates[value] : value);
        }

        const placeholders = insertFields.map(() => '?').join(', ');
        const sql = `INSERT INTO clients (${insertFields.join(', ')}) VALUES (${placeholders})`;
        pool.query(sql, insertValues, (insertErr, result) => {
            if (insertErr) {
                console.error('SQL Error inserting client:', insertErr.message);
                if (insertErr.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ error: 'A client with one of these unique values already exists.' });
                }
                return res.status(500).json({ error: 'Unable to save client. Check the database constraints and try again.' });
            }
            res.status(201).json({ id: result.insertId });
        });
    });
});

const findConfiguredService = (value, callback) => {
    pool.query(
        `SELECT service_code AS code, service_name AS name
         FROM service_fees
         WHERE UPPER(service_code) = UPPER(?) OR LOWER(service_name) = LOWER(?)
         LIMIT 1`,
        [value, value],
        callback
    );
};

// GET: Fetch all bookings
app.get('/api/bookings', (req, res) => {
    pool.query(`SELECT b.*,
        sf.service_code AS resolved_service_code,
        sf.service_name AS resolved_service_name,
        DATE_FORMAT(b.start_time, '%Y-%m-%d %H:%i:%s') AS api_start_time,
        DATE_FORMAT(b.end_time, '%Y-%m-%d %H:%i:%s') AS api_end_time
        FROM bookings AS b
        LEFT JOIN service_fees AS sf ON sf.service_code = b.service_type_id`, (err, results) => {
        if (err) {
            console.error('❌ SQL Error on /api/bookings:', err.message);
            return res.status(500).json({ error: err.message });
        }
        
        const formatted = (results || []).map(b => ({
            id: b.id,
            clientId: b.client_id || b.clientId,
            caregiverId: b.caregiver_id || b.caregiverId,
            serviceTypeId: b.resolved_service_code || b.service_type_id || b.serviceTypeId,
            startTime: b.api_start_time || b.start_time || b.startTime,
            endTime: b.api_end_time || b.end_time || b.endTime,
            serviceType: b.resolved_service_name || b.service_type || '',
            providerType: b.provider_type || '',
            caregiverCode: b.caregiver_id || b.caregiver_code || '',
            caregiverName: b.caregiver_name || '',
            includesMeal: Boolean(b.includes_meal),
            mealCount: b.meal_count === null || b.meal_count === undefined ? null : Number(b.meal_count),
            softMeal: Boolean(b.soft_meal),
            isOvertime: b.is_overtime || b.isOvertime || 0,
            remarks: b.remarks || ''
        }));
        res.json(formatted);
    });
});

app.post('/api/bookings', (req, res) => {
    const body = req.body;
    const clientId = String(body && body.clientId !== undefined ? body.clientId : '');

    if (!/^\d+$/.test(clientId)) return res.status(400).json({ error: 'A valid client is required.' });

    const textFields = ['serviceType', 'caregiverCode', 'caregiverName', 'remarks'];
    const values = {};
    for (const field of textFields) {
        const value = body[field] === undefined || body[field] === null ? '' : body[field];
        if (typeof value !== 'string') return res.status(400).json({ error: `${field} must be text.` });
        values[field] = value.trim();
    }
    if (!values.serviceType) return res.status(400).json({ error: 'Service type is required.' });
    if (!values.caregiverCode || !values.caregiverName) {
        return res.status(400).json({ error: 'Caregiver code and name are required.' });
    }
    values.providerType = values.serviceType;
    if (values.serviceType.length > 120 ||
        values.caregiverCode.length > 50 || values.caregiverName.length > 150 ||
        values.remarks.length > 1000) {
        return res.status(400).json({ error: 'Service, provider, caregiver, or remarks text exceeds its allowed length.' });
    }
    if (body.includesMeal !== undefined && typeof body.includesMeal !== 'boolean') {
        return res.status(400).json({ error: 'includesMeal must be true or false.' });
    }

    pool.query('SELECT id FROM clients WHERE id = ? LIMIT 1', [clientId], (clientErr, clients) => {
        if (clientErr) {
            console.error('SQL Error validating booking client:', clientErr.message);
            return res.status(500).json({ error: 'Unable to validate the selected client.' });
        }
        if (!clients.length) return res.status(404).json({ error: 'Selected client was not found.' });

        findConfiguredService(values.serviceType, (serviceErr, services) => {
            if (serviceErr) {
                console.error('SQL Error resolving booking service:', serviceErr.message);
                return res.status(500).json({ error: 'Unable to resolve the selected service.' });
            }
            if (!services.length) return res.status(400).json({ error: 'Selected service is not configured in service_fees.' });
            const service = services[0];
            const mealOptions = normalizeMealOptions(body, service);
            if (!mealOptions) return res.status(400).json({ error: 'Meal count must be 1, 2, or 3 and softMeal must be true or false.' });
            const bookingTimes = normalizeBookingTimes(body, service);
            if (!bookingTimes) {
                return res.status(400).json({ error: 'A valid service date and end time after start time are required.' });
            }
            const { startTime, endTime } = bookingTimes;
            const sql = `INSERT INTO bookings
                (client_id, caregiver_id, service_type_id, start_time, end_time, service_type, provider_type,
                 caregiver_code, caregiver_name, remarks, includes_meal, meal_count, soft_meal)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const params = [
                clientId, values.caregiverCode, service.code, startTime, endTime, service.name, service.name,
                values.caregiverCode, values.caregiverName, values.remarks, body.includesMeal ? 1 : 0,
                mealOptions.mealCount, mealOptions.softMeal ? 1 : 0
            ];
            pool.query(sql, params, (insertErr, result) => {
                if (insertErr) {
                    console.error('SQL Error inserting booking:', insertErr.message);
                    if (insertErr.code === 'ER_BAD_FIELD_ERROR') {
                        return res.status(500).json({
                            error: 'The bookings table is missing columns required by this API. Run ccsv-backend/scheduling-schema.sql in the ccsv_system database.'
                        });
                    }
                    return res.status(500).json({ error: 'Unable to save booking. Confirm the bookings table has the current schema.' });
                }
                res.status(201).json({
                    booking: {
                        id: result.insertId,
                        clientId: Number(clientId),
                        caregiverId: values.caregiverCode,
                        serviceTypeId: service.code,
                        startTime,
                        endTime,
                        serviceType: service.name,
                        providerType: service.name,
                        caregiverCode: values.caregiverCode,
                        caregiverName: values.caregiverName,
                        includesMeal: Boolean(body.includesMeal),
                        mealCount: mealOptions.mealCount,
                        softMeal: mealOptions.softMeal,
                        remarks: values.remarks
                    }
                });
            });
        });
    });
});

app.put('/api/bookings/:id', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid booking ID.' });
    const body = req.body;
    const clientId = String(body && body.clientId !== undefined ? body.clientId : '');

    if (!/^\d+$/.test(clientId)) return res.status(400).json({ error: 'A valid client is required.' });

    const textFields = ['serviceType', 'caregiverCode', 'caregiverName', 'remarks'];
    const values = {};
    for (const field of textFields) {
        const value = body[field] === undefined || body[field] === null ? '' : body[field];
        if (typeof value !== 'string') return res.status(400).json({ error: `${field} must be text.` });
        values[field] = value.trim();
    }
    if (!values.serviceType) return res.status(400).json({ error: 'Service type is required.' });
    if (!values.caregiverCode || !values.caregiverName) {
        return res.status(400).json({ error: 'Caregiver code and name are required.' });
    }
    values.providerType = values.serviceType;
    if (values.serviceType.length > 120 ||
        values.caregiverCode.length > 50 || values.caregiverName.length > 150 ||
        values.remarks.length > 1000) {
        return res.status(400).json({ error: 'Service, provider, caregiver, or remarks text exceeds its allowed length.' });
    }
    if (body.includesMeal !== undefined && typeof body.includesMeal !== 'boolean') {
        return res.status(400).json({ error: 'includesMeal must be true or false.' });
    }

    pool.query('SELECT id FROM clients WHERE id = ? LIMIT 1', [clientId], (clientErr, clients) => {
        if (clientErr) {
            console.error('SQL Error validating booking client for update:', clientErr.message);
            return res.status(500).json({ error: 'Unable to validate the selected client.' });
        }
        if (!clients.length) return res.status(404).json({ error: 'Selected client was not found.' });

        pool.query('SELECT id FROM bookings WHERE id = ? LIMIT 1', [req.params.id], (bookingErr, bookings) => {
            if (bookingErr) {
                console.error('SQL Error checking booking before update:', bookingErr.message);
                return res.status(500).json({ error: 'Unable to find the selected booking.' });
            }
            if (!bookings.length) return res.status(404).json({ error: 'Booking was not found.' });

            findConfiguredService(values.serviceType, (serviceErr, services) => {
                if (serviceErr) {
                    console.error('SQL Error resolving booking service during update:', serviceErr.message);
                    return res.status(500).json({ error: 'Unable to resolve the selected service.' });
                }
                if (!services.length) return res.status(400).json({ error: 'Selected service is not configured in service_fees.' });
                const service = services[0];
                const mealOptions = normalizeMealOptions(body, service);
                if (!mealOptions) return res.status(400).json({ error: 'Meal count must be 1, 2, or 3 and softMeal must be true or false.' });
                const bookingTimes = normalizeBookingTimes(body, service);
                if (!bookingTimes) {
                    return res.status(400).json({ error: 'A valid service date and end time after start time are required.' });
                }
                const { startTime, endTime } = bookingTimes;
                const sql = `UPDATE bookings
                    SET client_id = ?, caregiver_id = ?, service_type_id = ?, start_time = ?, end_time = ?,
                        service_type = ?, provider_type = ?, caregiver_code = ?, caregiver_name = ?,
                        remarks = ?, includes_meal = ?, meal_count = ?, soft_meal = ?
                    WHERE id = ?`;
                const params = [
                    clientId, values.caregiverCode, service.code, startTime, endTime, service.name, service.name,
                    values.caregiverCode, values.caregiverName, values.remarks,
                    body.includesMeal ? 1 : 0, mealOptions.mealCount, mealOptions.softMeal ? 1 : 0, req.params.id
                ];
                pool.query(sql, params, updateErr => {
                    if (updateErr) {
                        console.error('SQL Error updating booking:', updateErr.message);
                        if (updateErr.code === 'ER_BAD_FIELD_ERROR') {
                            return res.status(500).json({
                                error: 'The bookings table is missing columns required by this API. Run ccsv-backend/scheduling-schema.sql in the ccsv_system database.'
                            });
                        }
                        return res.status(500).json({ error: 'Unable to update booking. Confirm the bookings table has the current schema.' });
                    }
                    res.json({
                        booking: {
                            id: Number(req.params.id),
                            clientId: Number(clientId),
                            caregiverId: values.caregiverCode,
                            serviceTypeId: service.code,
                            startTime,
                            endTime,
                            serviceType: service.name,
                            providerType: service.name,
                            caregiverCode: values.caregiverCode,
                            caregiverName: values.caregiverName,
                            includesMeal: Boolean(body.includesMeal),
                            mealCount: mealOptions.mealCount,
                            softMeal: mealOptions.softMeal,
                            remarks: values.remarks
                        }
                    });
                });
            });
        });
    });
});

app.delete('/api/bookings/:id', (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid booking ID.' });
    pool.query('DELETE FROM bookings WHERE id = ?', [req.params.id], (err, result) => {
        if (err) {
            console.error('SQL Error deleting booking:', err.message);
            return res.status(500).json({ error: 'Unable to delete booking.' });
        }
        if (!result.affectedRows) return res.status(404).json({ error: 'Booking was not found.' });
        res.status(204).end();
    });
});

app.get('/api/service-colors', (req, res) => {
    pool.query('SELECT service_code AS serviceCode, service_type AS serviceType, color FROM service_colors', (err, rows) => {
        if (err) {
            console.error('SQL Error reading booking colors by service:', err.message);
            return res.status(500).json({ error: 'Unable to load service booking colors. Run scheduling-schema.sql.' });
        }
        res.json(rows);
    });
});

app.put('/api/service-colors/:code', (req, res) => {
    const serviceCode = typeof req.params.code === 'string' ? req.params.code.trim().toUpperCase() : '';
    const serviceType = req.body && typeof req.body.serviceType === 'string' ? req.body.serviceType.trim() : '';
    const color = req.body && req.body.color;
    if (!serviceCode || serviceCode.length > 20) {
        return res.status(400).json({ error: 'A valid service code is required.' });
    }
    if (!serviceType || serviceType.length > 120) {
        return res.status(400).json({ error: 'A valid service type is required.' });
    }
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return res.status(400).json({ error: 'Color must be a six-digit hexadecimal value.' });
    }
    pool.query(
        `INSERT INTO service_colors (service_code, service_type, color) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE color = VALUES(color)`,
        [serviceCode, serviceType, color.toUpperCase()],
        err => {
            if (err) {
                console.error('SQL Error saving booking color by service:', err.message);
                return res.status(500).json({ error: 'Unable to save service booking color. Run scheduling-schema.sql.' });
            }
            res.json({ serviceCode, serviceType, color: color.toUpperCase() });
        }
    );
});

app.get('/api/services', async (req, res) => {
    try {
        const [rows, durationRows] = await Promise.all([
            queryRows(pool, 'SELECT service_code AS code, service_name AS name, service_professional AS serviceProfessional, service_fee AS serviceFee, meal_included AS mealIncluded FROM service_fees ORDER BY display_order, service_code'),
            queryRows(pool, 'SELECT service_code AS code, duration_hours AS hours, service_fee AS serviceFee FROM service_duration_fees ORDER BY service_code, duration_hours')
        ]);
        const durationFeesByCode = groupDurationFees(durationRows);
        res.json(rows.map(service => ({
            ...service,
            serviceFee: Number(service.serviceFee),
            mealIncluded: Boolean(service.mealIncluded),
            durationFees: (durationFeesByCode.get(String(service.code).toUpperCase()) || (
                isDurationPricedService(service.code) ? defaultDurationFees() : []
            )).map(({ hours, serviceFee }) => ({ hours, serviceFee }))
        })));
    } catch (error) {
        console.error('SQL Error reading public service options:', error.message);
        res.status(500).json({ error: 'Unable to load public service options and fees. Run service-fees-schema.sql in ccsv_system.' });
    }
});

app.get('/api/calendar-holidays', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const holidayRows = await queryRows(pool,
            "SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday FROM basic_holidays ORDER BY holiday_date"
        );
        res.json(holidayRows.map(row => row.holiday));
    } catch (error) {
        console.error('SQL Error reading calendar holidays:', error.message);
        res.status(500).json({ error: 'Unable to load calendar holidays. Run basic-settings-normalized-schema.sql in ccsv_system.' });
    }
});

const queryRows = (executor, sql, params = []) => new Promise((resolve, reject) => {
    executor.query(sql, params, (error, rows) => {
        if (error) return reject(error);
        resolve(rows);
    });
});

app.get('/api/basic', async (req, res) => {
    if (!authorizeBasicSettings(req, res)) return;
    try {
        const [settingRows, serviceRows, durationFeeRows, caregiverRows, mealCaregiverRows, holidayRows] = await Promise.all([
            queryRows(pool, "SELECT TIME_FORMAT(normal_start, '%H:%i') AS normalStart, TIME_FORMAT(normal_end, '%H:%i') AS normalEnd FROM system_settings WHERE settings_id = 1"),
            queryRows(pool, 'SELECT service_code AS code, service_name AS name, service_professional AS serviceProfessional, service_fee AS serviceFee, caregiver_fee AS caregiverFee, meal_included AS mealIncluded FROM service_fees ORDER BY display_order, service_code'),
            queryRows(pool, 'SELECT service_code AS code, duration_hours AS hours, service_fee AS serviceFee, caregiver_fee AS caregiverFee FROM service_duration_fees ORDER BY service_code, duration_hours'),
            queryRows(pool, 'SELECT caregiver_code AS code, caregiver_name AS name, hourly_fee AS hourlyFee FROM basic_caregivers ORDER BY display_order, caregiver_code'),
            queryRows(pool, 'SELECT caregiver_code AS code, caregiver_name AS name FROM basic_meal_caregivers ORDER BY display_order, caregiver_code'),
            queryRows(pool, "SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday FROM basic_holidays ORDER BY holiday_date")
        ]);
        const serviceSettings = settingRows[0] || {
            normalStart: defaultBasicSettings.normalStart,
            normalEnd: defaultBasicSettings.normalEnd
        };
        const durationFeesByCode = groupDurationFees(durationFeeRows);
        res.json({
            ...serviceSettings,
            services: serviceRows.map(service => ({
                ...service,
                serviceFee: Number(service.serviceFee),
                caregiverFee: Number(service.caregiverFee),
                mealIncluded: Boolean(service.mealIncluded),
                durationFees: durationFeesByCode.get(String(service.code).toUpperCase()) || (
                    isDurationPricedService(service.code) ? defaultDurationFees() : []
                )
            })),
            caregivers: caregiverRows.map(caregiver => ({
                ...caregiver,
                hourlyFee: Number(caregiver.hourlyFee)
            })),
            mealCaregivers: mealCaregiverRows,
            holidays: holidayRows.map(row => row.holiday)
        });
    } catch (error) {
        console.error('SQL Error reading normalized Basic settings:', error.message);
        res.status(500).json({
            error: 'Unable to load Basic settings. Run basic-settings-normalized-schema.sql and service-fees-schema.sql in ccsv_system.'
        });
    }
});

app.put('/api/basic', async (req, res) => {
    if (!authorizeBasicSettings(req, res)) return;
    const validationError = validateBasicSettings(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const services = req.body.services.map(service => ({
        code: service.code.trim().toUpperCase(),
        name: service.name.trim(),
        serviceProfessional: typeof service.serviceProfessional === 'string' ? service.serviceProfessional.trim() : '',
        serviceFee: Number(service.serviceFee),
        caregiverFee: Number(service.caregiverFee),
        mealIncluded: service.mealIncluded,
        durationFees: isDurationPricedService(service.code)
            ? [...service.durationFees].sort((a, b) => a.hours - b.hours).map(tier => ({
                hours: tier.hours,
                serviceFee: Number(tier.serviceFee),
                caregiverFee: Number(tier.caregiverFee)
            }))
            : []
    }));
    const caregivers = req.body.caregivers.map(caregiver => ({
        code: caregiver.code.trim(),
        name: caregiver.name.trim(),
        hourlyFee: Number(caregiver.hourlyFee)
    }));
    const mealCaregivers = (req.body.mealCaregivers || []).map(caregiver => ({
        code: caregiver.code.trim(),
        name: caregiver.name.trim()
    }));
    const holidays = [...new Set(req.body.holidays)];
    let connection;
    try {
        connection = await new Promise((resolve, reject) => {
            pool.getConnection((error, acquiredConnection) => {
                if (error) return reject(error);
                resolve(acquiredConnection);
            });
        });
        await new Promise((resolve, reject) => {
            connection.beginTransaction(error => error ? reject(error) : resolve());
        });

        await queryRows(connection,
            `INSERT INTO system_settings (settings_id, normal_start, normal_end) VALUES (1, ?, ?)
             ON DUPLICATE KEY UPDATE normal_start = VALUES(normal_start), normal_end = VALUES(normal_end)`,
            [req.body.normalStart, req.body.normalEnd]
        );

        const serviceRows = services.map((service, index) => [
            service.code, service.name, service.serviceProfessional, service.serviceFee,
            service.caregiverFee, service.mealIncluded ? 1 : 0, index
        ]);
        await queryRows(connection,
            `INSERT INTO service_fees
                (service_code, service_name, service_professional, service_fee, caregiver_fee, meal_included, display_order)
             VALUES ?
             ON DUPLICATE KEY UPDATE
                service_name = VALUES(service_name),
                service_professional = VALUES(service_professional),
                service_fee = VALUES(service_fee),
                caregiver_fee = VALUES(caregiver_fee),
                meal_included = VALUES(meal_included),
                display_order = VALUES(display_order)`,
            [serviceRows]
        );
        await queryRows(connection, 'DELETE FROM service_fees WHERE service_code NOT IN (?)', [
            services.map(service => service.code)
        ]);
        const durationPricedServices = services.filter(service => isDurationPricedService(service.code));
        const durationFeeRows = durationPricedServices.flatMap(service => service.durationFees.map(tier => [
            service.code, tier.hours, tier.serviceFee, tier.caregiverFee
        ]));
        await queryRows(connection, 'DELETE FROM service_duration_fees WHERE service_code IN (?)', [
            durationPricedServices.map(service => service.code)
        ]);
        if (durationFeeRows.length) {
            await queryRows(connection,
                'INSERT INTO service_duration_fees (service_code, duration_hours, service_fee, caregiver_fee) VALUES ?',
                [durationFeeRows]
            );
        }

        await queryRows(connection, 'DELETE FROM basic_caregivers');
        if (caregivers.length) {
            await queryRows(connection,
                'INSERT INTO basic_caregivers (caregiver_code, caregiver_name, hourly_fee, display_order) VALUES ?',
                [caregivers.map((caregiver, index) => [caregiver.code, caregiver.name, caregiver.hourlyFee, index])]
            );
        }

        await queryRows(connection, 'DELETE FROM basic_meal_caregivers');
        if (mealCaregivers.length) {
            await queryRows(connection,
                'INSERT INTO basic_meal_caregivers (caregiver_code, caregiver_name, display_order) VALUES ?',
                [mealCaregivers.map((caregiver, index) => [caregiver.code, caregiver.name, index])]
            );
        }

        await queryRows(connection, 'DELETE FROM basic_holidays');
        if (holidays.length) {
            await queryRows(connection, 'INSERT INTO basic_holidays (holiday_date) VALUES ?', [
                holidays.map(holiday => [holiday])
            ]);
        }

        await new Promise((resolve, reject) => {
            connection.commit(error => error ? reject(error) : resolve());
        });
        res.json({
            normalStart: req.body.normalStart,
            normalEnd: req.body.normalEnd,
            services,
            caregivers,
            mealCaregivers,
            holidays
        });
    } catch (error) {
        console.error('SQL Error saving normalized Basic settings:', error.message);
        if (connection) {
            await new Promise(resolve => connection.rollback(() => resolve()));
        }
        res.status(500).json({
            error: `Unable to save Basic settings. Run basic-settings-normalized-schema.sql and service-fees-schema.sql in ccsv_system. ${error.message}`
        });
    } finally {
        if (connection) connection.release();
    }
});

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🚀 CCSV Backend server running at http://${HOST}:${PORT}`);
    if (!process.env.BASIC_SETTINGS_KEY) {
        console.warn('WARNING: BASIC_SETTINGS_KEY is not set; Basic settings use the insecure default password 1234.');
    }
});