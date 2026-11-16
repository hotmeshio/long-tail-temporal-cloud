// Unit tests never reach a network: every backend address points at nothing.
process.env.TEMPORAL_ADDRESS = 'temporal.test:7233';
process.env.LT_URL = 'http://lt.test';
process.env.LT_STORAGE_BACKEND = 'local';
delete process.env.TEMPORAL_API_KEY;
