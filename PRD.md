# Purroxy - Product Requirements Document

**Version:** 0.4.0
**Last updated:** 2026-04-09
**Tagline:** Record what you do on any website. Securely automate it forever.

---

## 1. Problem

Most websites have no public API. Users who want AI assistants to act on their behalf -- checking email, paying bills, looking up account info -- are stuck because the AI has no way to reach those sites.

Today, the workarounds are bad:
- **Give AI your credentials.** Dangerous. One breach exposes everything.
- **Reverse-engineer the site's internal API.** Requires deep technical skill and breaks when the site changes.
- **Copy-paste data manually.** Tedious, error-prone, defeats the point of having an AI assistant.
- **Use a general-purpose browser automation tool.** Requires coding. Doesn't integrate with AI assistants. Doesn't protect credentials.

Users need a way to teach their AI assistant how to do things on websites -- without writing code, without sharing passwords, and without becoming a web scraping expert.

---

## 2. Solution

Purroxy lets users record their interactions with any website and turn those recordings into reusable automations called **capabilities**. These capabilities can be invoked by AI assistants, so the AI can perform real actions on websites on the user's behalf.

**The core loop: Record once. Replay forever. No API needed.**

**Example:** A user logs into Yahoo Mail inside Purroxy, records the steps to check their inbox, and saves it as a capability. From that point on, their AI assistant can retrieve recent emails on demand -- without ever seeing the user's password.

### What makes Purroxy different

- **No code required.** Users demonstrate what they want automated by doing it. An AI guide helps them through the process.
- **Works on any website.** If you can use it in a browser, Purroxy can automate it.
- **Credentials never leave your machine.** Passwords, session tokens, and sensitive data are encrypted locally and never transmitted to any AI model or external service.
- **AI assistant integration.** Capabilities are directly callable by AI assistants as tools, enabling natural-language interaction with any website.

---

## 3. Users

### Primary: Non-technical users who use AI assistants
People who already use AI assistants (like Claude Desktop) and want them to do more -- specifically, interact with websites on their behalf. They are not developers. They don't want to write scripts, learn APIs, or configure browser automation frameworks.

### Secondary: Power users and developers
Technical users who want to automate repetitive web tasks but don't want to maintain brittle scraping scripts. They value the credential isolation and AI integration, and may contribute capabilities to the community.

---

## 4. Core Concepts

### Capability
A reusable automation that performs a specific action on a specific website. Examples:
- "Get my 10 most recent emails from Yahoo Mail"
- "Check my checking account balance on Chase"
- "Search for flights on Google Flights from city A to city B on date X"

A capability has:
- **A target website** where it operates
- **Recorded actions** that describe what to do (navigate, click, type, etc.)
- **Inputs** (parameters) that can vary each time it runs (e.g., search query, date range)
- **Outputs** that describe what data to extract from the result
- **Sensitive data references** that point to locally-encrypted values, never stored in the recording itself

### Site Profile
A grouping of all capabilities for a single website, along with the saved authentication session for that site. Users log in once per site; all capabilities for that site share the session.

### Vault
A locally-encrypted store for sensitive non-credential data that capabilities need at runtime -- credit card numbers, account IDs, security answers, etc. Values are injected directly into web forms during replay and scrubbed from any data before it reaches an AI model.

---

## 5. User Journeys

### 5.1 Building a Capability

**Goal:** Turn something the user does on a website into a reusable automation.

1. **Start:** User provides a website URL.
2. **Authentication:** If the site requires login, the user logs in interactively. Their session is saved and encrypted. The AI guide never sees the credentials -- only that authentication is needed.
3. **Discovery:** The AI guide analyzes the site and suggests useful capabilities the user could build.
4. **Recording:** The user selects a capability to build. The AI guide walks them through demonstrating the action. Each interaction (click, type, navigate) is captured.
5. **Parameterization:** The user reviews the recording and decides which values should be flexible inputs (e.g., a search term) vs. fixed.
6. **Output definition:** The AI guide proposes what data to extract from the resulting page. The user reviews and adjusts.
7. **Testing:** The user tests the capability with different inputs to verify it works.
8. **Saving:** The capability is saved and immediately available for use.

### 5.2 Running a Capability

**Goal:** AI assistant performs an action on a website on the user's behalf.

1. The user makes a natural-language request to their AI assistant (e.g., "check my recent emails").
2. The AI assistant identifies the matching capability and calls it with any needed parameters.
3. Purroxy replays the recorded actions in a browser, using the saved session and substituting any runtime parameters.
4. Data is extracted from the resulting page.
5. Sensitive fields are redacted before the result reaches the AI assistant.
6. The AI assistant presents the results to the user.

### 5.3 Managing Capabilities

**Goal:** Keep automations working and organized over time.

- Users can browse, rename, edit, delete, and test their capabilities.
- Capabilities surface their health status so users can see at a glance which ones are working and which need attention.
- When a capability breaks (usually because the target website changed), users can re-record it.

---

## 6. Features

### 6.1 Guided Capability Builder

An AI-powered conversational experience that walks users through building a capability.

**Requirements:**
- Present the target website alongside the AI conversation so the user can interact with both simultaneously.
- Detect when a website requires authentication and hand control to the user for interactive login.
- After login/page load, suggest capabilities the user could build based on what the site offers.
- Capture user interactions (clicks, text entry, navigation, scrolling, etc.) as the user demonstrates the desired action.
- Let users review captured interactions and confirm they're correct.
- Let users mark which captured values should become runtime parameters.
- Propose data extraction rules for the capability's output and let users review/adjust them.
- Support a test-before-save flow where users can try different inputs and verify results.
- Handle complex sites: multi-page workflows, iframes, dynamic content, cookie consent dialogs.

### 6.2 Capability Execution Engine

Replays saved capabilities reliably and securely.

**Requirements:**
- Replay recorded interactions in a browser, substituting runtime parameters and vault values.
- Use saved authentication sessions so users don't have to log in each time.
- Detect session expiration and prompt the user to re-authenticate when needed.
- Extract structured data from the resulting page.
- Support a fallback extraction method for highly dynamic pages where the primary method fails.
- Redact sensitive fields before returning results to AI assistants.
- Classify failures: distinguish between "the website changed" (needs re-recording) and transient errors (retry-worthy).
- Track capability health over time and surface degradation to users.
- Rate-limit execution to prevent overwhelming target websites.
- Automatically pause execution for a capability after repeated consecutive failures.

### 6.3 AI Assistant Integration

Expose capabilities as callable tools for AI assistants.

**Requirements:**
- Automatically discover all saved capabilities and register them as tools the AI assistant can call.
- No manual tool registration or configuration by the user beyond initial one-time setup.
- Support natural-language invocation -- the user asks for something, the AI maps it to the right capability.
- Pass runtime parameters from the AI assistant to the capability.
- Return structured results to the AI assistant, with sensitive fields redacted.
- Refuse all requests when the app is locked (see Security).

### 6.4 Capability Library

Manage and organize saved capabilities.

**Requirements:**
- List all site profiles and their capabilities.
- Show health status for each capability.
- Show whether the AI assistant integration is properly configured.
- Support renaming, editing, deleting, and manually testing capabilities.
- Show clear guidance when the AI assistant integration needs setup or troubleshooting.

### 6.5 Community Library

Share and discover capabilities built by others.

**Requirements:**
- Users can submit capabilities to a public library for community use.
- Submissions go through a review process before being published.
- Users can browse, search, and install community capabilities.
- One-click (or one-link) installation of community capabilities.
- Contributors who publish capabilities can earn free access to the product.

### 6.6 Vault

Secure storage for sensitive data used in automations.

**Requirements:**
- Encrypted local storage for sensitive key-value pairs (credit card numbers, account IDs, security answers, etc.).
- Users can add, edit, and delete vault entries.
- Capabilities reference vault entries by key; actual values are never stored in capability definitions.
- Vault values are injected at runtime and scrubbed from any data before it reaches AI models.

### 6.7 App Lock

Prevent unauthorized access when the user is away.

**Requirements:**
- Users can set a PIN and an inactivity timeout.
- The app locks automatically after the configured idle period.
- While locked, all capability execution is blocked -- including requests from AI assistants.
- Unlocking with the correct PIN restores full access.

---

## 7. Security Requirements

Security is the product's core value proposition. Every design decision must preserve these guarantees.

### Credential Isolation
- User credentials (passwords, tokens) are encrypted using OS-level encryption and never leave the user's machine.
- During capability building, the AI guide sees field labels (e.g., "email", "password") but never field values.
- During capability execution, credentials are injected directly into the browser engine, never through channels visible to AI models.
- No credential is ever transmitted to Purroxy's servers, AI providers, or any external service.

### Sensitive Data Protection
- Vault values are encrypted at rest using OS-level encryption.
- At runtime, vault values are typed directly into web forms by the browser engine.
- Before any page content reaches an AI model (for fallback extraction), all vault values are scrubbed and replaced with redaction markers.
- Capability outputs can mark fields as sensitive; these are redacted before being returned to AI assistants and are viewable only within the Purroxy app itself.

### Session Security
- Authentication sessions (cookies/tokens) are encrypted at rest.
- Sessions are used exclusively by the browser engine during capability replay.

### Physical Access Protection
- PIN-based app lock with configurable inactivity timeout.
- All automation is blocked while the app is locked.

---

## 8. Business Model

### Trial
- Free trial period for new users, no payment info required.
- Clear visibility of remaining trial time.

### Subscription
- Paid monthly subscription for continued use after trial.
- Managed through standard payment processing.

### Contributor Access
- Users who publish a capability to the community library receive free ongoing access.

### API Key
- Users provide their own AI API key for the capability building process (the AI-guided recording).
- Capability execution at runtime does not require an AI API key under normal circumstances.

---

## 9. Platform Requirements

- **Desktop application** -- cross-platform (macOS, Windows, Linux).
- **Offline capable** -- saved capabilities run locally. Internet is only required for the AI-guided building process and license validation.
- **System tray integration** -- accessible without hunting for the app window.
- **Privacy first** -- no telemetry by default; optional opt-in.

---

## 10. Success Metrics

- **Capability completion rate:** % of users who start building a capability and successfully save one.
- **Capability reliability:** % of capability executions that succeed without manual intervention.
- **Time to first capability:** How long from install to a working automation.
- **Community library growth:** Number of community-published capabilities.
- **Retention:** % of trial users who convert to paid or contributor access.

---

## 11. Open Questions

- What is the right trial length and price point?
- How should capability versioning work when a site changes and a capability needs re-recording?
- Should capabilities support chaining (output of one feeds into another)?
- How should the product handle sites with aggressive bot detection?
- What AI assistants beyond Claude Desktop should be supported, and how?
- Should there be a team/enterprise tier with shared capabilities?
