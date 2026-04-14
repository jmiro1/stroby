/**
 * Google Apps Script — Newsletter Email → Stroby Intelligence Webhook
 *
 * This script runs inside Google Workspace (joaquim@stroby.ai) and
 * forwards newsletter emails addressed to stroby@stroby.ai to the
 * Stroby intelligence API for content analysis.
 *
 * SETUP:
 * 1. Go to https://script.google.com
 * 2. Create a new project, name it "Stroby Newsletter Forwarder"
 * 3. Paste this entire file into Code.gs
 * 4. Update the CONFIG section below with your values
 * 5. Run `setup()` once (grants Gmail permissions)
 * 6. Run `installTrigger()` once (creates the 5-minute timer)
 * 7. Done — newsletters will be auto-analyzed from now on
 *
 * The script:
 * - Searches for unread emails TO stroby@stroby.ai (last 3 days)
 * - Skips emails already labeled "Stroby/Processed"
 * - POSTs sender + body to /api/intelligence/analyze
 * - Labels processed emails so they're not re-sent
 */

// ── CONFIG — update these ──
const CONFIG = {
  WEBHOOK_URL: "https://stroby.ai/api/intelligence/analyze",
  API_SECRET: "dYa2OusGw8rQ8Fi094kPMUf67b-wZMpiPWARBePtLhk", // INTELLIGENCE_API_SECRET
  ALIAS_EMAIL: "stroby@stroby.ai",
  PROCESSED_LABEL: "Stroby/Processed",
  MAX_PER_RUN: 10,  // Process max 10 emails per trigger (avoid timeout)
};

/**
 * Main function — called by the time-driven trigger every 5 minutes.
 */
function processNewNewsletters() {
  // Ensure the label exists
  let label = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.PROCESSED_LABEL);
  }

  // Search for recent emails TO the alias, not yet processed
  const query = `to:${CONFIG.ALIAS_EMAIL} newer_than:3d -label:${CONFIG.PROCESSED_LABEL.replace("/", "-")} is:unread`;
  const threads = GmailApp.search(query, 0, CONFIG.MAX_PER_RUN);

  if (threads.length === 0) return;

  Logger.log(`Found ${threads.length} newsletter threads to process`);

  for (const thread of threads) {
    const messages = thread.getMessages();
    // Process the latest message in the thread
    const msg = messages[messages.length - 1];

    const sender = msg.getFrom();
    const subject = msg.getSubject();
    const body = msg.getPlainBody() || msg.getBody(); // Plain text preferred, HTML fallback
    const date = msg.getDate();

    // Extract sender email from "Name <email>" format
    const emailMatch = sender.match(/<([^>]+)>/);
    const senderEmail = emailMatch ? emailMatch[1] : sender;

    Logger.log(`Processing: "${subject}" from ${senderEmail}`);

    try {
      const payload = {
        sender_email: senderEmail.toLowerCase(),
        issue_text: body.substring(0, 50000), // Cap at 50k chars
        publication_url: "",
      };

      const options = {
        method: "post",
        contentType: "application/json",
        headers: {
          "Authorization": "Bearer " + CONFIG.API_SECRET,
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      };

      const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
      const code = response.getResponseCode();
      const result = JSON.parse(response.getContentText());

      if (code === 200) {
        Logger.log(`  → ${result.analyzed ? "Analyzed" : "Skipped"} (${result.reason || "creator matched"})`);
      } else {
        Logger.log(`  → API error ${code}: ${response.getContentText().substring(0, 200)}`);
      }
    } catch (e) {
      Logger.log(`  → Error: ${e.message}`);
    }

    // Mark as processed regardless (don't retry — avoids infinite loops)
    thread.addLabel(label);
    thread.markRead();
  }
}

/**
 * Run once to install the time-driven trigger (every 5 minutes).
 */
function installTrigger() {
  // Remove existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === "processNewNewsletters") {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  // Create new trigger: every 5 minutes
  ScriptApp.newTrigger("processNewNewsletters")
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("Trigger installed: processNewNewsletters every 5 minutes");
}

/**
 * Run once to test permissions (grants Gmail access).
 */
function setup() {
  const label = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL);
  if (!label) {
    GmailApp.createLabel(CONFIG.PROCESSED_LABEL);
    Logger.log("Created label: " + CONFIG.PROCESSED_LABEL);
  } else {
    Logger.log("Label already exists: " + CONFIG.PROCESSED_LABEL);
  }
  Logger.log("Setup complete — Gmail permissions granted.");
}

/**
 * Manual test: process one email and log the result.
 */
function testOneEmail() {
  const query = `to:${CONFIG.ALIAS_EMAIL} newer_than:7d is:unread`;
  const threads = GmailApp.search(query, 0, 1);
  if (threads.length === 0) {
    Logger.log("No unread emails found for " + CONFIG.ALIAS_EMAIL);
    return;
  }

  const msg = threads[0].getMessages()[0];
  Logger.log("Test email: " + msg.getSubject() + " from " + msg.getFrom());
  Logger.log("Body preview: " + (msg.getPlainBody() || msg.getBody()).substring(0, 500));

  // Don't actually POST — just show what would be sent
  Logger.log("Would POST to: " + CONFIG.WEBHOOK_URL);
  Logger.log("Sender email: " + msg.getFrom());
}
