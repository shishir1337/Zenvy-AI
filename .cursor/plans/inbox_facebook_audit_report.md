# Inbox + Facebook Integration — Audit Report

**Date:** March 13, 2025  
**Scope:** End-to-end audit of inbox feature, Facebook Graph API integration, security, UX, and code quality.

---

## 1. BUGS

### 1.1 Webhook: Echoed Messages Not Filtered (Critical)
**Location:** `backend/src/webhook/webhook.service.ts`  
**Issue:** Facebook sends `message.is_echo: true` for messages sent by your Page. The webhook processes these as inbound messages, creating duplicates in the inbox.  
**Fix:** Skip processing when `event.message?.is_echo === true`.

### 1.2 Webhook: Message Without Text (e.g. Attachments Only)
**Location:** `backend/src/webhook/webhook.service.ts`  
**Issue:** `event.message.text` can be undefined for attachment-only messages. The code uses `event.message.text || ''`, storing empty content. Attachments are ignored.  
**Fix:** Handle `message.attachments`; store placeholder or attachment metadata when text is empty.

### 1.3 API Error Message Extraction
**Location:** `frontend/src/lib/api.ts`  
**Issue:** `error.message` may not exist on NestJS validation/HTTP errors. Structure can be `{ message: string }` or `{ message: string[] }` (class-validator) or `{ statusCode, error }`.  
**Fix:** Normalize error extraction, e.g. `error.message ?? error.error ?? res.statusText`.

### 1.4 SSE Reconnect Logic
**Location:** `frontend/src/hooks/use-inbox-events.ts`  
**Issue:** On disconnect, `connect()` is called again after 3s, but the `reader.read()` loop exits on `done` (connection close). The `setTimeout(connect, 3000)` runs, but the effect cleanup aborts the controller, so the retry may be aborted. Also, no exponential backoff.  
**Fix:** Use a ref to track intentional abort vs. network error; implement reconnect with backoff.

### 1.5 Cursor Pagination: `limit` Validation
**Location:** `backend/src/inbox/inbox.controller.ts`  
**Issue:** `parseInt(limit, 10)` can return `NaN` for invalid input; no max limit enforced.  
**Fix:** Validate/clamp limit (e.g. 1–100), default 50.

---

## 2. SECURITY ISSUES

### 2.1 Webhook Signature Optional When `appSecret` Missing
**Location:** `backend/src/webhook/webhook.controller.ts` (lines 75–84)  
**Issue:** If `FACEBOOK_APP_SECRET` is not set, signature verification is skipped. Webhook can be spoofed.  
**Fix:** Require `FACEBOOK_APP_SECRET` in production; fail verification if missing.

### 2.2 `getFacebookPageInfo` Exposes Token in Request
**Location:** `backend/src/channel/channel.controller.ts`  
**Issue:** Endpoint accepts `pageAccessToken` in body. Token is sent over the wire (HTTPS helps but token is still in logs/memory).  
**Mitigation:** Ensure HTTPS; avoid logging request bodies. Consider short-lived tokens for this flow.

### 2.3 Channel Controller: No DTO Validation for `getFacebookPageInfo`
**Location:** `backend/src/channel/channel.controller.ts` (line 22)  
**Issue:** Uses `@Body() body: { pageAccessToken: string }` without class-validator. No validation.  
**Fix:** Add DTO with `@IsString()`, `@IsNotEmpty()`, `@MinLength(10)`.

### 2.4 Token in URL (Graph API)
**Location:** `backend/src/channel/channel.service.ts` (lines 59–60, 191, 208), `inbox.service.ts` (line 103)  
**Issue:** Access tokens are passed as query params. URLs can be logged.  
**Mitigation:** Prefer POST with token in body where supported; document that tokens must not be logged.

### 2.5 Webhook Header Case Sensitivity
**Location:** `backend/src/webhook/webhook.controller.ts` (line 70)  
**Issue:** `req.headers['x-hub-signature-256']`—Express normalizes headers to lowercase, so this is fine.  
**Status:** No change needed.

---

## 3. MISSING FEATURES / TYPE LIST

### 3.1 Message Attachments
**Location:** `webhook.service.ts`, `inbox.service.ts`, Prisma `Message`  
**Issue:** `attachments` exists in schema but is never set. Webhook ignores `message.attachments`; reply API is text-only.  
**Fix:** Parse and store attachments in webhook; support attachment send in reply (or document as future work).

### 3.2 Participant Name Resolution
**Location:** `webhook.service.ts`, Prisma `Conversation.participantName`  
**Issue:** `participantName` is always `null`. Facebook provides PSID but not display name in webhook.  
**Fix:** Call Graph API `GET /{psid}` with `fields=name` to resolve name (respect rate limits).

### 3.3 Unread / Read State
**Location:** Schema, UI  
**Issue:** No unread indicator. Plan mentioned "unread indicator (optional)"—not implemented.  
**Fix:** Add `readAt` or `unreadCount` to Conversation; update on view/reply.

### 3.4 Sync Existing Conversations from Graph API
**Location:** Plan Phase 4  
**Issue:** Plan said "On first load, optionally fetch from `GET /{page-id}/conversations` and merge into DB." Not implemented.  
**Fix:** Add optional sync on channel connect or on first conversations load.

### 3.5 Instagram Webhook Structure
**Location:** `webhook.service.ts`  
**Issue:** Instagram webhook has different structure (e.g. `entry[].messaging` vs `entry[].changes`). Code assumes `page` structure for both.  
**Fix:** Add handling for Instagram-specific webhook payloads or document Instagram as unsupported for now.

### 3.6 Message Types
**Location:** Webhook, UI  
**Issue:** Only `message.text` handled. No support for quick_reply, postback, reaction, etc.  
**Fix:** Extend webhook handler for other event types; store in metadata or dedicated fields.

---

## 4. FLOW ISSUES

### 4.1 Connect Flow: No "Fetch Page Info" for Facebook
**Location:** Frontend connect form  
**Issue:** For Facebook, user can paste token and backend fetches page info. Frontend could call `getFacebookPageInfo` before connect to preview page name/ID—not used.  
**Fix:** Optional "Verify" or "Fetch info" button that calls `getFacebookPageInfo` and pre-fills pageId/pageName.

### 4.2 Reply Optimistic Update
**Location:** `frontend/src/app/(dashboard)/dashboard/inbox/page.tsx`  
**Issue:** Reply appends message optimistically (`setMessages((prev) => [...prev, msg])`) but doesn’t refetch. If API returns different shape, UI could be wrong.  
**Status:** Acceptable; consider refetch for consistency.

### 4.3 Conversation List Filtering Redundancy
**Location:** `frontend/src/app/(dashboard)/dashboard/inbox/page.tsx` (lines 159–161)  
**Issue:** `listConversations` already accepts `channelId`; backend filters. Frontend also filters: `filteredConversations = selectedChannelId ? conversations.filter(...) : conversations`. If backend returns all org conversations, filtering is correct. If backend returns only for selected channel when `channelId` is passed, we may double-filter.  
**Check:** Backend uses `channelId` in where clause when provided. So when `selectedChannelId` is set, we get filtered results. When null, we get all. Frontend filter is redundant if we always pass `selectedChannelId` to the API. Actually when `selectedChannelId` is null we pass `undefined`, so we get all. When set, we get filtered. So the frontend filter is redundant—conversations are already filtered by backend.  
**Fix:** Remove frontend filter or ensure backend behavior is correct; simplify.

### 4.4 Messages Load on Conversation Select
**Location:** `frontend/src/app/(dashboard)/dashboard/inbox/page.tsx`  
**Issue:** `refreshMessages` depends on `selectedConversation`. When switching conversations, messages load. No loading state for messages.  
**Fix:** Add loading state for messages (skeleton or spinner).

---

## 5. BAD USER EXPERIENCE

### 5.1 No Loading State for Conversations
**Location:** Inbox page  
**Issue:** Initial load shows spinner, but `refreshConversations` has no loading indicator.  
**Fix:** Add loading state for conversations list.

### 5.2 No Loading State for Messages
**Location:** Inbox page  
**Issue:** When selecting a conversation, messages load with no indicator.  
**Fix:** Add `messagesLoading` state and skeleton/spinner.

### 5.3 Reply Errors Not Shown to User
**Location:** `handleReply` in inbox page  
**Issue:** `catch` only does `console.error`. User gets no feedback.  
**Fix:** Set error state and display toast or inline error.

### 5.4 Disconnect Uses `confirm()`
**Location:** `handleDisconnect`  
**Issue:** Native `confirm()` is used. Poor UX on mobile.  
**Fix:** Use a confirmation dialog/modal component.

### 5.5 No Empty State for Messages
**Location:** Message thread  
**Issue:** When conversation has no messages, list is empty with no explicit empty message.  
**Fix:** Add "No messages yet" when `messages.length === 0`.

### 5.6 ChevronDown in Conversations Header
**Location:** Line 334  
**Issue:** `ChevronDown` is decorative with no action (e.g. no channel filter dropdown).  
**Fix:** Remove or wire to a channel filter dropdown.

### 5.7 Mobile Responsiveness
**Location:** Inbox layout  
**Issue:** Plan mentioned "Collapsible sidebar on mobile; conversation list / message view toggle." Not implemented.  
**Fix:** Add responsive layout (e.g. sheet/drawer for mobile).

---

## 6. FACEBOOK GRAPH API ALIGNMENT

### 6.1 API Version ✓
**Location:** `inbox.service.ts`, `channel.service.ts`  
**Status:** Code uses `v25.0`. As of March 2026, v25.0 was released Feb 18, 2026 and is the current stable version. **No change needed.**

### 6.2 Response Field: `message_id` vs `recipient_id`
**Location:** `inbox.service.ts` (line 116)  
**Issue:** Code expects `data.message_id`. Send API returns `message_id` (and `recipient_id`). Align with docs.  
**Status:** Correct per Send API reference.

### 6.3 Webhook Subscribed Fields
**Location:** `channel.service.ts` (line 209)  
**Issue:** Only `messages` is subscribed. For read receipts, deliveries, etc., additional fields are needed.  
**Fix:** Document current scope; add more fields if required (e.g. `messaging_postbacks`, `message_reads`).

### 6.4 Instagram Send API
**Location:** `inbox.service.ts`  
**Issue:** Instagram uses the same Send API pattern but may require `HUMAN_AGENT` tag outside 24h window. Not implemented.  
**Fix:** For Instagram, add tag logic when outside 24h window (if supported).

---

## 7. BAD CODE QUALITY / PRACTICES

### 7.1 Hardcoded Graph API Base URL
**Location:** `inbox.service.ts`, `channel.service.ts`  
**Issue:** `https://graph.facebook.com/v25.0` is hardcoded in multiple places.  
**Fix:** Centralize in config (e.g. `configuration.ts`).

### 7.2 Magic Strings
**Location:** `webhook.service.ts`  
**Issue:** `conversationId = \`t_${senderId}\``—magic prefix.  
**Fix:** Extract to constant, e.g. `CONVERSATION_ID_PREFIX = 't_'`.

### 7.3 Console.warn in Production
**Location:** `channel.service.ts` (lines 215–222)  
**Issue:** `console.warn` for webhook subscription failures.  
**Fix:** Use proper logger (e.g. NestJS Logger) with log levels.

### 7.4 Console.error in Webhook
**Location:** `webhook.controller.ts` (line 101)  
**Issue:** `console.error` for processing errors.  
**Fix:** Use Logger; consider error reporting (e.g. Sentry).

### 7.5 No Request Timeout for Graph API
**Location:** `inbox.service.ts`, `channel.service.ts`  
**Issue:** `fetch()` has no timeout. Slow responses can block.  
**Fix:** Use `AbortController` with timeout or a fetch wrapper with timeout.

### 7.6 Duplicate Conversation Check
**Location:** `webhook.service.ts`  
**Issue:** `findUnique` then `create` or `update`—race condition if two webhook events for same conversation arrive concurrently.  
**Fix:** Use `upsert` or transaction with proper locking.

### 7.7 Inbox Controller: Route Ordering
**Location:** `inbox.controller.ts`  
**Issue:** `GET :id` and `GET :id/messages`—Express/Nest matches in order. `GET :id` could match "messages" as id if not careful. NestJS typically matches more specific routes first, but worth verifying.  
**Status:** NestJS matches `:id/messages` as a more specific path. Likely OK.

---

## 8. IMPROVEMENTS

### 8.1 Centralize Facebook Client
**Suggestion:** Create `FacebookGraphService` to encapsulate all Graph API calls, version, and error handling.

### 8.2 Add Integration Tests
**Suggestion:** E2E tests for webhook verification, message flow, reply flow.

### 8.3 Add Retry for Reply
**Suggestion:** Retry on transient Graph API errors (e.g. 5xx, rate limit).

### 8.4 Pagination UI for Messages
**Suggestion:** "Load older" when `hasMore` is true; currently frontend doesn’t use `nextCursor`/`hasMore`.

### 8.5 Rate Limiting
**Suggestion:** Throttle reply endpoint per user/org to avoid abuse.

### 8.6 Data Deletion Callback
**Suggestion:** Per Facebook checklist, implement data deletion callback URL for user data deletion requests.

---

## 9. SUMMARY TABLE

| Category        | Count | Priority |
|----------------|-------|----------|
| Bugs           | 5     | High     |
| Security       | 4     | High     |
| Missing        | 6     | Medium   |
| Flow           | 4     | Medium   |
| UX             | 7     | Medium   |
| API Alignment  | 3     | Medium   |
| Code Quality   | 7     | Low      |
| Improvements   | 6     | Low      |

---

## 10. RECOMMENDED FIX ORDER

1. **P0 (Critical):** Echoed message filter, webhook signature required in prod
2. **P1 (High):** DTO validation for getFacebookPageInfo, reply error display, message loading state
3. **P2 (Medium):** Participant name resolution, attachment handling, unread state, mobile layout
4. **P3 (Low):** Centralize Graph client, logging, pagination UI, data deletion callback
