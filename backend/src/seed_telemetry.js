import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:123@localhost:5432/siloguard';
const pool = new Pool({ connectionString: databaseUrl });

async function seedTelemetry() {
  try {
    const now = Date.now();
    for (let i = 24; i >= 1; i--) {
      const time = new Date(now - i * 120000); // 2 minutes interval
      const temp = Number((27.5 + Math.sin(i / 3) * 1.5 + (Math.random() * 0.3 - 0.15)).toFixed(1));
      const humidity = Number((64.0 + Math.cos(i / 3) * 4.0 + (Math.random() * 0.5 - 0.25)).toFixed(1));
      const gas = Math.round(280 + Math.sin(i / 2) * 50);
      const fan_on = humidity > 70;

      await pool.query(
        'INSERT INTO telemetry (silo_id, temp, humidity, gas, fan_on, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        ['silo-01', temp, humidity, gas, fan_on, time.toISOString()]
      );

      // Juga untuk silo-02
      await pool.query(
        'INSERT INTO telemetry (silo_id, temp, humidity, gas, fan_on, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        ['silo-02', Number((26.5 + Math.cos(i / 3) * 1.2).toFixed(1)), Number((62.0 + Math.sin(i / 3) * 3.0).toFixed(1)), Math.round(250 + Math.cos(i / 2) * 40), false, time.toISOString()]
      );
    }

    const countRes = await pool.query('SELECT count(*) FROM telemetry');
    console.log('SEED SUCCESS: Total telemetry rows =', countRes.rows[0].count);
  } catch (err) {
    console.error('SEED ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

seedTelemetry();
