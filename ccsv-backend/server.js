const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

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

// Test DB Connection on startup
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Connected to MariaDB successfully on port 3307!');
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
            status: c.status || 'Active',
            pic: c.pic || 'ET'
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
        { key: 'telephone', columns: ['telephone'] }
    ];
    const requiredKeys = fields.map(field => field.key);
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
        valuesByKey[key] = typeof value === 'string' ? value.trim() : '';
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

// GET: Fetch all bookings
app.get('/api/bookings', (req, res) => {
    pool.query('SELECT * FROM bookings', (err, results) => {
        if (err) {
            console.error('❌ SQL Error on /api/bookings:', err.message);
            return res.status(500).json({ error: err.message });
        }
        
        const formatted = (results || []).map(b => ({
            id: b.id,
            clientId: b.client_id || b.clientId,
            caregiverId: b.caregiver_id || b.caregiverId,
            serviceTypeId: b.service_type_id || b.serviceTypeId,
            startTime: b.start_time || b.startTime,
            endTime: b.end_time || b.endTime,
            isOvertime: b.is_overtime || b.isOvertime || 0,
            remarks: b.remarks || ''
        }));
        res.json(formatted);
    });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🚀 CCSV Backend server running at http://${HOST}:${PORT}`);
});