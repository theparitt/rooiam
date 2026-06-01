function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function rejectUnknownKeys(source, payload, allowedKeys) {
  const unknown = Object.keys(payload).filter(key => !allowedKeys.includes(key))
  if (unknown.length > 0) {
    throw badRequest(
      `Invalid ${source}: unknown ${source === 'query' ? 'parameter' : 'field'} '${unknown[0]}' is not allowed. Allowed ${source === 'query' ? 'parameters' : 'fields'}: ${allowedKeys.join(', ')}`
    )
  }
}

function requireKeys(source, payload, requiredKeys) {
  for (const key of requiredKeys) {
    if (!(key in payload)) {
      throw badRequest(`Invalid ${source}: required ${source === 'query' ? 'parameter' : 'field'} '${key}' is missing.`)
    }
  }
}

function assertString(source, payload, key, { allowEmpty = false } = {}) {
  const value = payload[key]
  if (typeof value !== 'string') {
    throw badRequest(`Invalid ${source}: ${source === 'query' ? 'parameter' : 'field'} '${key}' must be a string.`)
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw badRequest(`Invalid ${source}: ${source === 'query' ? 'parameter' : 'field'} '${key}' cannot be empty.`)
  }
}

function assertOptionalString(source, payload, key, { allowEmpty = false } = {}) {
  if (!(key in payload)) return
  assertString(source, payload, key, { allowEmpty })
}

function assertPositiveIntString(source, payload, key) {
  if (!(key in payload)) return
  const value = payload[key]
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw badRequest(`Invalid ${source}: parameter '${key}' must be a positive integer.`)
  }
}

export function validateBody(req, { required = [], optional = [], allowEmptyBody = false, stringFields = {}, crossValidate } = {}) {
  const body = req.body

  if (!isPlainObject(body)) {
    if (allowEmptyBody && (body == null || body === '')) return
    throw badRequest('Invalid json_body: request body must be a JSON object.')
  }

  const allowedKeys = [...required, ...optional]
  rejectUnknownKeys('json_body', body, allowedKeys)
  requireKeys('json_body', body, required)

  for (const key of required) {
    if (stringFields[key] !== false) {
      assertString('json_body', body, key, stringFields[key] || {})
    }
  }

  for (const key of optional) {
    if (stringFields[key] !== false) {
      assertOptionalString('json_body', body, key, stringFields[key] || {})
    }
  }

  if (crossValidate) crossValidate(body)
}

export function validateQuery(req, { required = [], optional = [], stringFields = {}, positiveIntFields = [], crossValidate } = {}) {
  const query = req.query
  if (!isPlainObject(query)) {
    throw badRequest('Invalid query: query must be a flat object.')
  }

  const allowedKeys = [...required, ...optional]
  rejectUnknownKeys('query', query, allowedKeys)
  requireKeys('query', query, required)

  for (const key of required) {
    if (positiveIntFields.includes(key)) {
      assertPositiveIntString('query', query, key)
    } else if (stringFields[key] !== false) {
      assertString('query', query, key, stringFields[key] || {})
    }
  }

  for (const key of optional) {
    if (positiveIntFields.includes(key)) {
      assertPositiveIntString('query', query, key)
    } else if (stringFields[key] !== false) {
      assertOptionalString('query', query, key, stringFields[key] || {})
    }
  }

  if (crossValidate) crossValidate(query)
}

export function validateEmptyQuery(req) {
  validateQuery(req, { required: [], optional: [] })
}

export function validateEmptyBody(req) {
  validateBody(req, { required: [], optional: [] })
}
