const { execSync } = require('child_process');
const fs = require('fs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const strategy = typeof event.body === 'string'
      ? JSON.parse(event.body)
      : event.body;

    fs.writeFileSync('/tmp/strategy.json',
      JSON.stringify(strategy));
    fs.writeFileSync('/tmp/track.csv',
      fs.readFileSync('/var/task/track.csv', 'utf8'));

    execSync(
      '/var/task/telemetry_sim /tmp/track.csv ' +
      '/tmp/output.json /tmp/strategy.json',
      { timeout: 25000, stdio: 'pipe' }
    );

    const result = fs.readFileSync(
      '/tmp/output.json', 'utf8');

    return {
      statusCode: 200,
      headers,
      body: result
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        details: error.stderr?.toString() || ''
      })
    };
  }
};
