const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Create MariaDB connection pool on port 3307
const pool = mysql.createPool({
    host: '192.168.1.142',
    port: 3307,
    user: 'root',
    password: 'Okc25258486!',
    database: 'ccsv_system',
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
            copayTier: c.co_payment_percentage || c.copay_tier || 'Cat I',
            district: c.service_district || c.district || '',
            address: c.address || '',
            telephone: c.telephone || '',
            status: c.status || 'Active',
            pic: c.pic || 'ET'
        }));
        res.json(formatted);
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

const PORT = 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🚀 CCSV Backend server running at http://${HOST}:${PORT}`);
});