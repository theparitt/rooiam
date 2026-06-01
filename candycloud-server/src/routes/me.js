import { Router } from 'express'
import { loadSession } from '../session.js'
import { getProfile, upsertProfile } from '../db.js'
import { validateBody, validateEmptyQuery } from '../validation.js'

export const meRouter = Router()

async function requireAuth(req, res, next) {
  const sessionId = req.cookies?.candycloud_session
  const session = await loadSession(sessionId).catch(() => null)
  if (!session) {
    return res.status(401).json({ error: { message: 'Not authenticated' } })
  }
  req.session = session
  req.rooiamUserId = session.userinfo?.sub
  next()
}

meRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    const profile = getProfile(req.rooiamUserId)
    res.json({
      rooiam_user_id: req.rooiamUserId,
      email: req.session.userinfo?.email || null,
      display_name: profile?.display_name || null,
    })
  } catch (err) {
    next(err)
  }
})

meRouter.patch('/me/profile', requireAuth, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateBody(req, {
      required: ['display_name'],
      optional: [],
      stringFields: { display_name: { allowEmpty: true } },
    })
    const { display_name } = req.body
    const profile = upsertProfile(req.rooiamUserId, display_name)
    res.json({
      ok: true,
      display_name: profile?.display_name || null,
    })
  } catch (err) {
    next(err)
  }
})
