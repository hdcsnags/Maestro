const HUBSPOT_SCHEMA = {
  fields: {
    name:             { hubspotProperty: 'firstname',        dataType: 'string',       required: true  },
    email:            { hubspotProperty: 'email',            dataType: 'string',       required: true  },
    company:          { hubspotProperty: 'company',          dataType: 'string',       required: false },
    pain_point_tags:  { hubspotProperty: 'pain_point_tags',  dataType: 'array|string', required: false },
    service_interest: { hubspotProperty: 'service_interest', dataType: 'string',       required: false },
    utm_source:       { hubspotProperty: 'utm_source',       dataType: 'string',       required: false },
    utm_medium:       { hubspotProperty: 'utm_medium',       dataType: 'string',       required: false },
    utm_campaign:     { hubspotProperty: 'utm_campaign',     dataType: 'string',       required: false },
    utm_term:         { hubspotProperty: 'utm_term',         dataType: 'string',       required: false },
    utm_content:      { hubspotProperty: 'utm_content',      dataType: 'string',       required: false },
  }
};

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const ALLOWED_UTM_VALUE = /^[a-zA-Z0-9-]+$/;
const DEBOUNCE_MS = 700;

const endpointUrl = (typeof __HUBSPOT_PROXY_ENDPOINT__ !== 'undefined' && __HUBSPOT_PROXY_ENDPOINT__)
  ? __HUBSPOT_PROXY_ENDPOINT__
  : '';

let debounceTimer = null;
let inFlight = false;

function sanitizeUtmValue(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return ALLOWED_UTM_VALUE.test(normalized) ? normalized : '';
}

function readUtmParams(search) {
  const params = new URLSearchParams(search || '');
  return UTM_KEYS.reduce((acc, key) => {
    const raw = params.get(key);
    const clean = sanitizeUtmValue(raw || '');
    if (clean) acc[key] = clean;
    return acc;
  }, {});
}

function getSchemaFields() {
  const fields = HUBSPOT_SCHEMA && HUBSPOT_SCHEMA.fields;
  if (!fields || typeof fields !== 'object') return [];
  return Object.keys(fields).map((key) => ({ name: key, ...fields[key] }));
}

function mapPayloadToSchema(payload) {
  const fields = getSchemaFields();
  return fields.reduce((acc, field) => {
    const key = typeof field === 'string'
      ? field
      : (field && (field.name || field.key || field.id));

    if (!key) return acc;

    const value = payload && Object.prototype.hasOwnProperty.call(payload, key)
      ? payload[key]
      : undefined;

    if (value !== undefined && value !== null && value !== '') {
      acc[key] = value;
    }

    return acc;
  }, {});
}

function hasHoneypotHit(formData) {
  if (!formData || typeof formData !== 'object') return false;
  const candidateKeys = ['website', 'url', 'company_website', 'hp_field', 'honeypot'];
  return candidateKeys.some((key) => {
    const value = formData[key];
    return typeof value === 'string' && value.trim() !== '';
  });
}

async function postPayload(payload) {
  if (!endpointUrl) {
    throw new Error('HubSpot proxy endpoint is not configured');
  }

  const response = await fetch(endpointUrl, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HubSpot proxy request failed with status ${response.status}`);
  }

  return response;
}

export async function submitToHubSpot(payload) {
  if (inFlight) return false;

  const normalizedPayload = payload && typeof payload === 'object' ? { ...payload } : {};
  if (hasHoneypotHit(normalizedPayload)) return false;

  const utm = readUtmParams(window.location && window.location.search);
  const mapped = mapPayloadToSchema(normalizedPayload);
  const finalPayload = {
    ...mapped,
    ...utm
  };

  inFlight = true;
  try {
    await postPayload(finalPayload);
    return true;
  } finally {
    inFlight = false;
  }
}

export function debouncedSubmitToHubSpot(payload, delay = DEBOUNCE_MS) {
  return new Promise((resolve, reject) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      try {
        const result = await submitToHubSpot(payload);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }, delay);
  });
}
