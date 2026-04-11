# Purroxy - User Stories & UX Journeys

Derived from PRD v0.4.0. Each story follows the format:
**"I should be able to [action], when I am [context], trying to [goal]."**

---

## 1. First Launch & Setup

### 1.1 Onboarding
- I should be able to **install Purroxy on my operating system of choice**, when I am **on macOS, Windows, or Linux**, trying to **get started with browser automation**.
- I should be able to **set up the AI key required for building capabilities**, when I am **launching Purroxy for the first time**, trying to **enable the AI-guided capability builder**.
- I should be able to **start a free trial without entering payment info**, when I am **a new user**, trying to **evaluate whether Purroxy is worth paying for**.
- I should be able to **see how much trial time I have left**, when I am **using Purroxy during my trial period**, trying to **decide whether to subscribe before access expires**.

### 1.2 Account & Subscription
- I should be able to **create an account**, when I am **setting up Purroxy**, trying to **establish my identity for licensing and community features**.
- I should be able to **subscribe to a paid plan**, when I am **managing my account**, trying to **continue using Purroxy after my trial ends**.
- I should be able to **see my current subscription status**, when I am **in account settings**, trying to **confirm my access is active or understand why capabilities won't run**.
- I should be able to **recover my account if I forget my password**, when I am **unable to log in**, trying to **regain access without losing my saved capabilities**.

### 1.3 AI Assistant Integration
- I should be able to **connect Purroxy to my AI assistant with minimal setup**, when I am **configuring Purroxy for the first time**, trying to **make my capabilities available as tools the AI can call**.
- I should be able to **verify that my AI assistant is properly connected**, when I am **troubleshooting why my AI assistant can't see my capabilities**, trying to **diagnose and fix the integration**.

---

## 2. Building a Capability

### 2.1 Starting a Build
- I should be able to **enter any website URL to start building an automation**, when I am **beginning a new build session**, trying to **create an automation for a website that has no API**.
- I should be able to **add a new capability to a site I've already set up**, when I am **viewing an existing site in my library**, trying to **expand what my AI assistant can do on that site without re-doing login**.
- I should be able to **see the target website and interact with the AI guide at the same time**, when I am **building a capability**, trying to **follow the guide's instructions while performing actions on the site**.

### 2.2 Authentication & Login
- I should be able to **log into a website interactively during the build process**, when I am **building a capability for a site that requires authentication**, trying to **provide a valid session without exposing my password to AI**.
- I should be able to **have Purroxy detect that a site needs login**, when I am **starting a build on an authenticated site**, trying to **avoid manually figuring out when and how to authenticate**.
- I should be able to **have my login session saved securely for future automation runs**, when I am **finishing a login flow during capability building**, trying to **ensure capabilities can run later without me logging in again each time**.
- I should be able to **log into sites with complex authentication** (multi-step forms, multi-factor, OAuth redirects), when I am **building a capability for an enterprise or banking site**, trying to **automate sites with non-trivial login flows**.

### 2.3 Guided Capability Design
- I should be able to **receive suggestions for useful capabilities** based on the site I'm on, when I am **on a site that the AI guide has analyzed**, trying to **quickly identify useful automations without brainstorming from scratch**.
- I should be able to **be walked through demonstrating a capability step by step**, when I am **building a specific capability**, trying to **record the exact actions needed for an automation**.
- I should be able to **see confirmation that each of my interactions was captured**, when I am **demonstrating an action on the website**, trying to **verify my recording is complete and correct**.
- I should be able to **perform multi-page workflows during recording**, when I am **demonstrating an action that spans several pages**, trying to **build a capability that isn't limited to a single page**.

### 2.4 Parameters & Extraction
- I should be able to **decide which recorded values should be flexible inputs**, when I am **finishing a capability recording**, trying to **make the capability accept different inputs each time it runs** (e.g., different search queries, dates, recipients).
- I should be able to **choose for each recorded value whether it stays fixed or becomes a parameter**, when I am **reviewing my recording**, trying to **control exactly what varies at runtime vs. what stays constant**.
- I should be able to **review what data the capability will extract from the result page**, when I am **reviewing a capability before saving**, trying to **understand and verify what output the automation will produce**.
- I should be able to **have dynamic parts of the page automatically identified**, when I am **building a capability with variable page elements**, trying to **handle pages where element structure depends on the input without doing it manually**.

### 2.5 Testing & Saving
- I should be able to **test a capability with different inputs before saving it**, when I am **in the test-before-save step**, trying to **verify the automation works with real variations, not just my demo data**.
- I should be able to **see the actual output from a test run**, when I am **testing a capability**, trying to **confirm the right data is being extracted**.
- I should be able to **save a completed capability so it's permanently available**, when I am **satisfied with the recording, parameters, and test results**, trying to **make this automation ready for use by my AI assistant**.

---

## 3. Managing Capabilities (Library)

### 3.1 Browsing & Organizing
- I should be able to **see all my sites and their capabilities in one place**, when I am **on the library page**, trying to **get an overview of everything I've automated**.
- I should be able to **see which capabilities are working and which need attention**, when I am **scanning my library**, trying to **quickly spot automations that may be broken or unreliable**.
- I should be able to **see whether my AI assistant integration is properly set up**, when I am **on the library page**, trying to **understand whether my AI assistant can actually use my capabilities**.

### 3.2 Capability Actions
- I should be able to **rename a capability**, when I am **viewing it in the library**, trying to **give it a clearer name that makes sense when my AI assistant lists available tools**.
- I should be able to **delete a capability**, when I am **viewing it in the library**, trying to **remove an automation I no longer need**.
- I should be able to **edit an existing capability**, when I am **viewing it in the library**, trying to **fix or update an automation that has drifted from the site's current design**.
- I should be able to **manually test any capability from the library**, when I am **troubleshooting a capability that seems broken**, trying to **see what's failing before deciding whether to re-record**.

---

## 4. Using Capabilities via AI Assistant

### 4.1 Discovery & Invocation
- I should be able to **see my capabilities listed as available tools in my AI assistant**, when I am **chatting with my AI assistant after setup**, trying to **ask the AI to do things on websites for me**.
- I should be able to **ask for what I want in natural language**, when I am **using my AI assistant**, trying to **trigger a capability without knowing the exact tool name** (e.g., "check my recent emails").
- I should be able to **have the AI call the right capability with the right parameters**, when I am **making a request that maps to a saved automation**, trying to **get real data back from a website without opening a browser myself**.

### 4.2 Execution & Results
- I should be able to **receive structured data from a website in my AI assistant's response**, when I am **after the AI runs a capability on my behalf**, trying to **read my emails, check a balance, or get any other web data conversationally**.
- I should be able to **trust that sensitive fields in the output are not sent to the AI**, when I am **reading the AI's response that includes private data**, trying to **know that my sensitive information stays on my machine**.
- I should be able to **have capabilities run using my saved session without re-authenticating**, when I am **asking the AI to run a capability**, trying to **get data from authenticated sites seamlessly**.
- I should be able to **pass specific inputs through the AI**, when I am **asking the AI to perform a parameterized action** (e.g., "send a message to John"), trying to **use capabilities flexibly with different values each time**.

### 4.3 Failure & Resilience
- I should be able to **get a clear error message when a capability fails**, when I am **using my AI assistant and a tool call fails**, trying to **understand whether the site changed, my session expired, or it was a temporary glitch**.
- I should be able to **have temporary errors retried automatically**, when I am **experiencing a flaky network or slow-loading site**, trying to **get results without manually re-running the request**.
- I should be able to **be told when a capability is broken and needs re-recording**, when I am **trying to use a capability that can no longer work because the website changed**, trying to **know what action to take instead of guessing**.
- I should be able to **trust that safeguards prevent excessive automated requests to websites**, when I am **not actively monitoring Purroxy**, trying to **avoid overwhelming a target site or triggering abuse detection**.

---

## 5. Security & Credentials

### 5.1 Credential Safety
- I should be able to **log into websites inside Purroxy without my password ever reaching an AI model or external service**, when I am **authenticating during capability building**, trying to **automate sensitive sites (banking, insurance) without compromising my credentials**.
- I should be able to **have my credentials encrypted using my operating system's security infrastructure**, when I am **storing login info for any site**, trying to **trust that my passwords are protected at rest by the strongest available mechanism**.
- I should be able to **have credentials used securely during automation without being exposed**, when I am **running a capability that requires authentication**, trying to **ensure my credentials are never visible in logs, AI conversations, or network traffic**.

### 5.2 Vault
- I should be able to **store sensitive non-credential data in an encrypted vault** (credit card numbers, account IDs, security answers, etc.), when I am **setting up Purroxy**, trying to **let capabilities fill in sensitive form fields without storing the values inside the automation itself**.
- I should be able to **add, edit, and delete vault entries**, when I am **managing my vault**, trying to **keep my sensitive data up to date**.
- I should be able to **use vault entries in my capabilities so the actual values are injected only at runtime**, when I am **building a capability that needs sensitive input** (e.g., a credit card number on a checkout form), trying to **automate form fills without storing secrets in the automation definition**.
- I should be able to **trust that vault values are scrubbed from any data before it reaches an AI model**, when I am **running capabilities that touch sensitive fields**, trying to **ensure my private data stays private even in extracted output**.

### 5.3 App Lock
- I should be able to **set a PIN and an inactivity timeout**, when I am **configuring security settings**, trying to **prevent unauthorized access to my automations when I step away from my computer**.
- I should be able to **have the app lock automatically after a period of inactivity**, when I am **away from my desk**, trying to **protect all my saved sessions and credentials without having to remember to lock manually**.
- I should be able to **have all automation requests blocked while the app is locked**, when I am **away from my machine**, trying to **ensure nobody can trigger capabilities in my absence**.
- I should be able to **unlock with my PIN and resume immediately**, when I am **returning to my computer**, trying to **get back to work quickly without re-authenticating every site**.

---

## 6. Community & Public Library

### 6.1 Publishing
- I should be able to **submit a capability I built to the public library**, when I am **viewing a working capability in my library**, trying to **share a useful automation with the community**.
- I should be able to **have my submission reviewed before it's published**, when I am **publishing a capability**, trying to **contribute through a transparent, quality-controlled process**.
- I should be able to **earn free access by publishing a capability**, when I am **deciding whether to subscribe**, trying to **get ongoing access by contributing to the community instead of paying**.

### 6.2 Discovering & Installing
- I should be able to **browse community-submitted capabilities**, when I am **looking for automations**, trying to **find pre-built capabilities for popular sites so I don't have to record them myself**.
- I should be able to **discover new capabilities as the community publishes them**, when I am **checking the library**, trying to **stay up to date with what's available**.
- I should be able to **install a community capability with a single action**, when I am **finding a capability I want**, trying to **add it to my local Purroxy without manual configuration**.

---

## 7. Settings & Configuration

- I should be able to **manage my AI API key**, when I am **in settings**, trying to **update or rotate the key used for capability building**.
- I should be able to **control whether any usage data is shared**, when I am **in settings**, trying to **make an informed choice about telemetry** (off by default).
- I should be able to **configure my auto-lock timing**, when I am **in security settings**, trying to **balance security with convenience for my usage pattern**.
- I should be able to **access Purroxy from the system tray**, when I am **using other applications**, trying to **quickly open or lock Purroxy without hunting for its window**.

---

## 8. Debugging & Troubleshooting

- I should be able to **get detailed diagnostic logs for a capability run**, when I am **diagnosing a broken capability or unexpected behavior**, trying to **understand exactly what happened during execution**.
- I should be able to **understand why a capability failed** (site changed vs. temporary error), when I am **investigating why a capability stopped working**, trying to **determine whether I need to re-record or just wait and retry**.
- I should be able to **see that automatic execution was paused after repeated failures**, when I am **dealing with a capability that keeps failing**, trying to **understand that the system protected me from hammering a broken workflow**.
- I should be able to **inspect the recorded actions of a capability**, when I am **troubleshooting a broken automation**, trying to **identify which specific action is failing and what needs to change**.

---

## 9. Offline & Edge Cases

- I should be able to **run saved capabilities without internet access to Purroxy's servers**, when I am **on a local network with access to target sites but no external connectivity**, trying to **use automations that work entirely locally**.
- I should be able to **understand why I can't build new capabilities offline**, when I am **attempting to start a build without internet**, trying to **understand the difference between building (needs AI) and running (local only)**.
- I should be able to **get results from highly dynamic or single-page-app websites**, when I am **running a capability against a site with complex client-side rendering**, trying to **get reliable output even when the page structure is unpredictable**.
- I should be able to **have common browser interruptions handled automatically during replay**, when I am **running a capability against a site that shows cookie banners or pop-ups**, trying to **avoid having my automation blocked by interstitials that weren't there during recording**.
