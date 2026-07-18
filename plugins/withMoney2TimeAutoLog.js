const fs = require('fs');
const path = require('path');

const {
  withDangerousMod,
  withEntitlementsPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

/**
 * iOS auto-log: the App Intents that back the Shortcuts "Transaction"
 * automation (Mode A) and Back Tap (Mode B).
 *
 * Everything lives in the HOST app target rather than an App Intents
 * extension: it needs no new bundle id or provisioning profile, and it keeps
 * `app.config.ts`'s dev-variant plugin filter (which is name-specific to
 * withMoney2TimeWidgets) from having to know about a second target whose
 * hardcoded bundle id would not be a child of `com.nelsongan.money2time.dev`.
 * The cost is that iOS background-launches the app to run the intent; the
 * intent itself touches no React Native and returns as soon as it has written
 * to the App Group, so the Swift here ports to an extension unchanged if that
 * ever needs to happen.
 *
 * The intent never touches the database. It queues taps into the App Group and
 * the app drains them through the normal `createTransaction` path, so the FX
 * snapshot / album auto-add / account-amount rules stay in one tested place.
 *
 * The Xcode/file helpers below are intentional copies of the private ones in
 * withMoney2TimeWidgets.js — config plugins are conventionally self-contained,
 * and hoisting them would mean editing a working 5k-line widget generator.
 */

const APP_GROUP = 'group.com.nelsongan.money2time.widgets';
const CATALOG_KEY = 'autolog_catalog';
const PENDING_KEY = 'autolog_pending';
/**
 * Screenshots queued by ScanScreenshotIntent. Entries (id/createdAt/filename)
 * live under this defaults key; the image bytes live as files in the
 * SCANS_DIR folder of the App Group container, because a screenshot is far too
 * big for UserDefaults. The app drains them into receipt scans on foreground.
 */
const PENDING_SCANS_KEY = 'autolog_pending_scans';
const SCANS_DIR = 'autolog-scans';
const CATALOG_SCHEMA_VERSION = 1;
const IOS_APP_TARGET_NAME = 'Money2Time';
/**
 * Back Tap deep link. The `action` is whatever the user picked in Auto-log
 * settings (quick | full | scan | voice), carried in the catalog; the app's
 * deep-link handler falls back to quick entry if it is missing or unknown.
 */
const ADD_URL_PREFIX = 'money2time://add?action=';
const DEFAULT_BACK_TAP_ACTION = 'quick';
/**
 * Seconds within which a re-run of `perform()` (after the category prompt is
 * answered) is treated as the same tap. See `upsertProvisional` in the Swift.
 */
const UPSERT_WINDOW_SECONDS = 120;

const SWIFT_SOURCES = [
  'Money2TimeAutoLogStore.swift',
  'Money2TimeAutoLogEntities.swift',
  'Money2TimeLogCardPaymentIntent.swift',
  'Money2TimeNewTransactionIntent.swift',
  'Money2TimeScanScreenshotIntent.swift',
  'Money2TimeAppShortcuts.swift',
  'Money2TimeAutoLogModule.swift',
];

/**
 * Files this plugin used to generate, under the intents' old names.
 *
 * Everything else here only ever adds, so without this an incremental
 * `expo prebuild` would leave the old copies on disk and in the target: they
 * declare the pre-rename structs (duplicate actions in Shortcuts) and call an
 * `AutoLogCategoryEntity` initializer that no longer exists, which fails the
 * build. Pruning them here is what keeps `--clean` from being mandatory.
 *
 * Safe to drop this list once no working copy predates the rename.
 */
const STALE_SWIFT_SOURCES = [
  'Money2TimeLogTransactionIntent.swift',
  'Money2TimeAddTransactionIntent.swift',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFileIfChanged(filePath, contents) {
  ensureDir(path.dirname(filePath));
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return;
  fs.writeFileSync(filePath, contents);
}

function unquoteXcodeValue(value) {
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
}

function findNativeTargetByName(project, name) {
  const targets = project.pbxNativeTargetSection();
  const entry = Object.entries(targets).find(([key, target]) => {
    if (key.endsWith('_comment')) return false;
    return unquoteXcodeValue(target.name) === name;
  });
  if (!entry) return null;
  return { uuid: entry[0], ...entry[1] };
}

function getOrCreateGroup(project, name, groupPath) {
  const existingGroup = project.pbxGroupByName(name);
  if (existingGroup) {
    return project.findPBXGroupKey({ name });
  }

  const group = project.addPbxGroup([], name, groupPath);
  const mainGroupKey = project.getFirstProject().firstProject.mainGroup;
  project.hash.project.objects.PBXGroup[mainGroupKey].children.push({
    value: group.uuid,
    comment: name,
  });
  return group.uuid;
}

function removeSourceFileIfPresent(project, filePath, targetUuid, groupKey) {
  const basename = path.basename(filePath);
  const hasReference = Object.values(project.pbxFileReferenceSection()).some(
    (entry) => entry && entry.name === `"${basename}"`,
  );
  // Unlinking the file but leaving the target referencing it is worse than
  // leaving both alone — Xcode fails with "Build input file cannot be found".
  if (!hasReference) return;
  project.removeSourceFile(filePath, { target: targetUuid }, groupKey);
}

function ensureSourceFile(project, filePath, targetUuid, groupKey) {
  const basename = path.basename(filePath);
  const existingFileReference = Object.values(project.pbxFileReferenceSection()).find(
    (entry) => entry && entry.name === `"${basename}"`,
  );
  if (existingFileReference) {
    existingFileReference.path = `"${filePath}"`;
  }

  const fileExists = Object.values(project.pbxBuildFileSection()).some(
    (entry) => entry && entry.fileRef_comment === basename,
  );
  if (fileExists) return;
  project.addSourceFile(filePath, { target: targetUuid }, groupKey);
}

// ---------------------------------------------------------------------------
// Swift sources
// ---------------------------------------------------------------------------

const AUTO_LOG_STORE_SWIFT = `import Foundation
import UserNotifications

/// Shared App Group storage for auto-log.
///
/// Generated by plugins/withMoney2TimeAutoLog.js — edit the plugin, not this file.
enum AutoLogStore {
  static let appGroup = "${APP_GROUP}"
  static let catalogKey = "${CATALOG_KEY}"
  static let pendingKey = "${PENDING_KEY}"
  static let pendingScansKey = "${PENDING_SCANS_KEY}"
  static let scansDirName = "${SCANS_DIR}"
  static let schemaVersion = ${CATALOG_SCHEMA_VERSION}
  static let upsertWindow: TimeInterval = ${UPSERT_WINDOW_SECONDS}

  struct CatalogAccount: Codable {
    let id: String
    let name: String
    let currency: String
  }

  struct CatalogCategory: Codable {
    let id: String
    let name: String
    let emoji: String
    /// Optional (rather than a schema bump) so a catalog written by a build that
    /// predates the picker filter still decodes. nil is treated as a root, which
    /// is the pre-filter behaviour: show everything.
    let isRoot: Bool?
  }

  struct Catalog: Codable {
    let schemaVersion: Int
    let reportingCurrency: String
    let isSimpleMode: Bool
    let isPro: Bool
    /// nil means unlimited (Pro).
    let remaining: Int?
    let defaultAccountId: String?
    let defaultExpenseCategoryId: String?
    /// Entry flow Back Tap opens: quick | full | scan | voice.
    let backTapAction: String?
    /// Localized title for the tap notification. Optional (rather than a schema
    /// bump) so a catalog written by a build that predates the notification
    /// still decodes — it just posts nothing until the app rewrites it.
    let notificationTitle: String?
    /// Localized title/body for the notification posted when a tap arrives with
    /// no usable amount. Optional for the same reason; the intent falls back to
    /// an English literal so a stale catalog still tells the user something.
    let failureNotificationTitle: String?
    let failureNotificationBody: String?
    /// Whether the Category picker offers subcategories. Optional for the same
    /// reason; nil means "no preference recorded", which shows everything.
    let includeSubcategories: Bool?
    /// Whether to skip the on-pay category prompt and let the app categorize the
    /// tap from its merchant name on drain. Optional for the same reason; nil is
    /// treated as true (the default), so a catalog written before this flag
    /// existed still gets the no-prompt behaviour the app now defaults to.
    let autoCategorizeByMerchant: Bool?
    let accounts: [CatalogAccount]
    /// Every expense category, roots and children alike. The picker narrows this
    /// via \`pickerCategories\`; the full list has to stay so an id already saved
    /// in a shortcut can still resolve.
    let categories: [CatalogCategory]
  }

  /// What the Category picker offers, as opposed to what can be resolved.
  ///
  /// Kept separate on purpose: a shortcut that preset a subcategory before the
  /// user hid subcategories must keep resolving it, or the parameter silently
  /// goes nil and the automation starts prompting on every tap instead of
  /// logging. Only \`suggestedEntities\` and the disambiguation prompt narrow.
  static func pickerCategories(catalog: Catalog) -> [CatalogCategory] {
    if catalog.includeSubcategories == true { return catalog.categories }
    // \`isRoot\` is nil on a catalog written before the flag existed. Treating nil
    // as a root keeps such a catalog listing everything, which is what that build
    // did anyway — the alternative filters every category out and empties the
    // picker.
    return catalog.categories.filter { $0.isRoot != false }
  }

  struct PendingEntry: Codable {
    var id: String
    var createdAt: String
    var amountRaw: String
    var merchant: String?
    var cardName: String?
    var accountId: String?
    var categoryId: String?
    var provisional: Bool
  }

  /// One screenshot queued by ScanScreenshotIntent. The image bytes live as a
  /// file in the App Group's \`scansDirName\` folder (far too big for
  /// UserDefaults); this entry is just its handle. The app drains these into
  /// receipt scans on foreground and clears both entry and file.
  struct PendingScan: Codable {
    var id: String
    var createdAt: String
    var filename: String
  }

  static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroup)
  }

  private static let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  /// The catalog the app publishes. A version we do not recognise is treated as
  /// absent so a stale build never renders a picker from a shape it misreads.
  static func loadCatalog() -> Catalog? {
    guard
      let json = defaults?.string(forKey: catalogKey),
      let data = json.data(using: .utf8),
      let catalog = try? JSONDecoder().decode(Catalog.self, from: data),
      catalog.schemaVersion == schemaVersion
    else {
      return nil
    }
    return catalog
  }

  static func loadPending() -> [PendingEntry] {
    guard
      let json = defaults?.string(forKey: pendingKey),
      let data = json.data(using: .utf8),
      let entries = try? JSONDecoder().decode([PendingEntry].self, from: data)
    else {
      return []
    }
    return entries
  }

  static func savePending(_ entries: [PendingEntry]) {
    guard
      let data = try? JSONEncoder().encode(entries),
      let json = String(data: data, encoding: .utf8)
    else {
      return
    }
    defaults?.set(json, forKey: pendingKey)
    defaults?.synchronize()
  }

  /// Folder in the App Group container holding queued screenshot files.
  /// Created on first use; nil when the App Group is unavailable.
  static func scansDirectory() -> URL? {
    guard
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroup
      )
    else {
      return nil
    }
    let dir = container.appendingPathComponent(scansDirName, isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  static func loadPendingScans() -> [PendingScan] {
    guard
      let json = defaults?.string(forKey: pendingScansKey),
      let data = json.data(using: .utf8),
      let entries = try? JSONDecoder().decode([PendingScan].self, from: data)
    else {
      return []
    }
    return entries
  }

  static func savePendingScans(_ entries: [PendingScan]) {
    guard
      let data = try? JSONEncoder().encode(entries),
      let json = String(data: data, encoding: .utf8)
    else {
      return
    }
    defaults?.set(json, forKey: pendingScansKey)
    defaults?.synchronize()
  }

  /// Write a screenshot into the App Group and queue it for the app to scan.
  /// File first, entry second, so a crash in between orphans a file (harmless)
  /// rather than queueing an entry whose image does not exist.
  @discardableResult
  static func enqueueScreenshot(data: Data, fileExtension: String) -> String? {
    guard let dir = scansDirectory() else { return nil }
    let id = UUID().uuidString
    let filename = "\\(id).\\(fileExtension)"
    do {
      try data.write(to: dir.appendingPathComponent(filename))
    } catch {
      return nil
    }
    var entries = loadPendingScans()
    entries.append(
      PendingScan(id: id, createdAt: isoFormatter.string(from: Date()), filename: filename)
    )
    savePendingScans(entries)
    return id
  }

  /// Remove drained screenshots — both the queue entries and their image files.
  static func clearPendingScans(ids: [String]) {
    let removing = Set(ids)
    var kept: [PendingScan] = []
    for entry in loadPendingScans() {
      if removing.contains(entry.id) {
        if let dir = scansDirectory() {
          try? FileManager.default.removeItem(at: dir.appendingPathComponent(entry.filename))
        }
      } else {
        kept.append(entry)
      }
    }
    savePendingScans(kept)
  }

  /// Whether an Amount string is worth logging: it must carry at least one
  /// non-zero digit. Catches the empty Amount iOS hands over for some Wallet
  /// transactions, a whitespace-only value, and a $0.00 authorization hold — all
  /// of which the app parses to nothing and drops, after this intent has already
  /// told the user it was logged. Deliberately locale-agnostic: a digit is a
  /// digit in every number format, so this needs none of the separator logic
  /// that (by design) lives in the JS parser, and it matches that parser's own
  /// ASCII-\`\\d\` reading — a non-Western-digit amount is dropped there too.
  static func hasLoggableAmount(_ raw: String) -> Bool {
    raw.contains { $0 >= "1" && $0 <= "9" }
  }

  /// Auto-logs still allowed before the free cap bites.
  ///
  /// Queued rows have not reached the app's lifetime counter yet, so they are
  /// subtracted here. The app recomputes \`remaining\` every time it rewrites the
  /// catalog, so the two self-correct without any extra shared counter.
  static func remaining(catalog: Catalog) -> Int {
    guard let remaining = catalog.remaining else { return Int.max }
    return max(0, remaining - loadPending().count)
  }

  /// Id of the provisional row this run would merge onto, if any.
  ///
  /// Non-nil means \`perform()\` is running a second time for a tap that is
  /// already queued, which is what tells the intent to skip the free-limit
  /// check: the row is committed, and re-checking would reject the user's own
  /// answer on their last free auto-log.
  static func provisionalMatchId(
    amountRaw: String,
    merchant: String?,
    cardName: String?
  ) -> String? {
    let now = Date()
    return loadPending().first { entry in
      guard entry.provisional else { return false }
      guard
        entry.amountRaw == amountRaw,
        entry.merchant == merchant,
        entry.cardName == cardName
      else {
        return false
      }
      guard let created = isoFormatter.date(from: entry.createdAt) else { return false }
      return now.timeIntervalSince(created) <= upsertWindow
    }?.id
  }

  /// Queue a tap, or patch the row a disambiguation re-run already queued.
  ///
  /// App Intents re-invokes \`perform()\` from the top once a parameter prompt is
  /// answered, so a plain append would log the same tap twice. The caller passes
  /// \`mergeIntoId\` — the id of the provisional row this run continues — and a
  /// non-nil value patches that row instead of appending. Passing nil always
  /// appends, which is what keeps two genuinely identical taps (same amount,
  /// merchant and card) from collapsing into one: only the caller knows whether
  /// this is a continuation (it carries the answered category) or a fresh tap.
  @discardableResult
  static func upsertProvisional(
    amountRaw: String,
    merchant: String?,
    cardName: String?,
    accountId: String?,
    categoryId: String?,
    mergeIntoId: String?
  ) -> String {
    var entries = loadPending()
    let now = Date()

    if let mergeIntoId = mergeIntoId,
       let index = entries.firstIndex(where: { $0.id == mergeIntoId }) {
      // createdAt stays put: it is the tap time, not the retry time.
      if let accountId = accountId {
        entries[index].accountId = accountId
      }
      if let categoryId = categoryId {
        entries[index].categoryId = categoryId
      }
      let id = entries[index].id
      savePending(entries)
      return id
    }

    let entry = PendingEntry(
      id: UUID().uuidString,
      createdAt: isoFormatter.string(from: now),
      amountRaw: amountRaw,
      merchant: merchant,
      cardName: cardName,
      accountId: accountId,
      categoryId: categoryId,
      provisional: true
    )
    entries.append(entry)
    savePending(entries)
    return entry.id
  }

  /// Settle a row so no later run can merge onto it.
  static func finalize(id: String, categoryId: String?) {
    var entries = loadPending()
    guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
    if let categoryId = categoryId {
      entries[index].categoryId = categoryId
    }
    entries[index].provisional = false
    savePending(entries)
  }

  static func clearPending(ids: [String]) {
    let removing = Set(ids)
    savePending(loadPending().filter { !removing.contains($0.id) })
  }

  /// Confirm a captured tap.
  ///
  /// The automation runs with \`openAppWhenRun = false\` and the tutorial has the
  /// user turn off Shortcuts' own "Notify When Run", so without this a tap gives
  /// no feedback at all. Posted at queue time rather than at drain: the row is
  /// only written to the database when the app next runs, which may be much
  /// later, and by then the confirmation is worthless.
  ///
  /// Title comes from the catalog because this runs backgrounded with no access
  /// to the app's i18n; the body is merchant + amount, which needs no
  /// translation. Deliberately fire-and-forget — a failed notification must
  /// never fail the tap that was already queued.
  static func notifyLogged(catalog: Catalog, amountRaw: String, merchant: String?) {
    guard let title = catalog.notificationTitle, !title.isEmpty else { return }

    let content = UNMutableNotificationContent()
    content.title = title
    if let merchant = merchant?.trimmingCharacters(in: .whitespacesAndNewlines), !merchant.isEmpty {
      content.body = "\\(merchant) · \\(amountRaw)"
    } else {
      content.body = amountRaw
    }

    // Never asks for permission: the app owns that prompt. If it was not
    // granted, iOS simply drops this.
    let request = UNNotificationRequest(
      identifier: "m2t-autolog-\\(UUID().uuidString)",
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
  }

  /// Tell the user a tap could not be auto-logged, so a payment that produced no
  /// transaction does not just vanish. Mirrors \`notifyLogged\` and is posted in
  /// its place — and instead of queueing anything — when the amount is unusable.
  /// Falls back to an English literal so a catalog written before these strings
  /// existed still says something rather than nothing.
  static func notifyUnreadable(catalog: Catalog, merchant: String?) {
    let title = catalog.failureNotificationTitle ?? "Couldn't auto-log a payment"
    let hint = catalog.failureNotificationBody ?? "Tap to add it manually."

    let content = UNMutableNotificationContent()
    content.title = title
    if let merchant = merchant?.trimmingCharacters(in: .whitespacesAndNewlines), !merchant.isEmpty {
      content.body = "\\(merchant) · \\(hint)"
    } else {
      content.body = hint
    }

    let request = UNNotificationRequest(
      identifier: "m2t-autolog-fail-\\(UUID().uuidString)",
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
  }
}

enum AutoLogError: Error, CustomLocalizedStringResourceConvertible {
  case notReady
  case limitReached
  case screenshotFailed

  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .notReady:
      return "Open Money2Time once to finish setting up Automation."
    case .limitReached:
      return "You have used all your free automations. Upgrade to Pro in Money2Time for unlimited."
    case .screenshotFailed:
      return "Couldn't read that screenshot. Try sharing it to Money2Time again."
    }
  }
}
`;

const AUTO_LOG_ENTITIES_SWIFT = `import AppIntents
import Foundation

/// Account / category pickers for the auto-log intents, populated from the
/// catalog the app publishes into the App Group.
///
/// Generated by plugins/withMoney2TimeAutoLog.js — edit the plugin, not this file.

struct AutoLogAccountEntity: AppEntity {
  let id: String
  let name: String
  let currency: String

  static var typeDisplayRepresentation: TypeDisplayRepresentation {
    TypeDisplayRepresentation(name: "Account")
  }

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\\(name)", subtitle: "\\(currency)")
  }

  static var defaultQuery: AutoLogAccountQuery { AutoLogAccountQuery() }
}

struct AutoLogAccountQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [AutoLogAccountEntity] {
    let all = try await suggestedEntities()
    return all.filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [AutoLogAccountEntity] {
    guard let catalog = AutoLogStore.loadCatalog() else { return [] }
    return catalog.accounts.map {
      AutoLogAccountEntity(id: $0.id, name: $0.name, currency: $0.currency)
    }
  }
}

/// Name only, no emoji: only some categories carry one, and a picker mixing
/// "🍜 Food" with "Transport" reads as ragged rather than decorated. The
/// catalog still ships the emoji — see AutoLogCatalogCategory in
/// features/transactions/lib/autoLogCatalog.ts for why it cannot be dropped yet.
struct AutoLogCategoryEntity: AppEntity {
  let id: String
  let name: String

  static var typeDisplayRepresentation: TypeDisplayRepresentation {
    TypeDisplayRepresentation(name: "Category")
  }

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\\(name)")
  }

  static var defaultQuery: AutoLogCategoryQuery { AutoLogCategoryQuery() }
}

struct AutoLogCategoryQuery: EntityQuery {
  /// Resolves ids already saved in a shortcut, so it reads the whole catalog
  /// rather than \`suggestedEntities\`: a preset subcategory has to keep resolving
  /// even while the picker is showing roots only.
  func entities(for identifiers: [String]) async throws -> [AutoLogCategoryEntity] {
    guard let catalog = AutoLogStore.loadCatalog() else { return [] }
    return catalog.categories
      .filter { identifiers.contains($0.id) }
      .map { AutoLogCategoryEntity(id: $0.id, name: $0.name) }
  }

  /// Populates the picker, which is where the roots-only preference applies.
  func suggestedEntities() async throws -> [AutoLogCategoryEntity] {
    guard let catalog = AutoLogStore.loadCatalog() else { return [] }
    return AutoLogStore.pickerCategories(catalog: catalog).map {
      AutoLogCategoryEntity(id: $0.id, name: $0.name)
    }
  }
}
`;

const LOG_CARD_PAYMENT_INTENT_SWIFT = `import AppIntents
import Foundation

/// Mode A: the action a Shortcuts "Transaction" automation runs on every
/// Apple Pay tap. Amount / Merchant / Card come from the trigger; Account is
/// normally preset per automation so a card lands in its own account.
///
/// The struct name is this intent's identity to iOS — renaming it orphans the
/// action in every shortcut already built on it. \`title\` is safe to reword.
/// It has no string catalog behind it, so Shortcuts shows this English literal
/// in every locale; \`LOG_CARD_PAYMENT_INTENT_NAME\` in constants/autoLogIntents.ts
/// mirrors it so Settings names the same action the user has to go find.
///
/// Generated by plugins/withMoney2TimeAutoLog.js — edit the plugin, not this file.
struct LogCardPaymentIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Card Payment"

  static var description = IntentDescription(
    "Log a card payment to Money2Time from a Transaction automation. Leave Category empty and Money2Time picks one from the merchant automatically — no prompt on pay. Set a Category to force it, or turn off auto-categorization in Money2Time to be asked each time.",
    categoryName: "Transactions"
  )

  /// Stays in the background: the whole job is a small App Group write.
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Amount")
  var amount: String

  @Parameter(title: "Merchant")
  var merchant: String?

  @Parameter(title: "Card")
  var card: String?

  @Parameter(title: "Account")
  var account: AutoLogAccountEntity?

  @Parameter(title: "Category")
  var category: AutoLogCategoryEntity?

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) at \\(\\.$merchant)") {
      \\.$card
      \\.$account
      \\.$category
    }
  }

  func perform() async throws -> some IntentResult {
    guard let catalog = AutoLogStore.loadCatalog() else {
      throw AutoLogError.notReady
    }

    // A tap with no usable amount can never become a transaction — iOS hands over
    // an empty Amount for some Wallet transactions, and a $0.00 authorization
    // hold is not a spend. Tell the user and stop here, before queueing or
    // notifying success, rather than letting the app silently drop the row after
    // this intent has already claimed it logged. Checked before the free-limit
    // gate so an unusable tap never burns a free auto-log either.
    guard AutoLogStore.hasLoggableAmount(amount) else {
      AutoLogStore.notifyUnreadable(catalog: catalog, merchant: merchant)
      return .result()
    }

    // A disambiguation continuation — App Intents re-invoking perform() after the
    // user answers the Category prompt — always arrives with \`category\` set; a
    // brand-new tap never does. Gate the merge on that: only such a continuation
    // patches the row it queued on the first pass. Two genuinely identical
    // Ask-Each-Time purchases (same amount, merchant, card) therefore queue as
    // two rows instead of the second collapsing onto the first and being lost.
    let mergeIntoId: String? =
      category != nil
      ? AutoLogStore.provisionalMatchId(amountRaw: amount, merchant: merchant, cardName: card)
      : nil
    // Only gate a brand-new tap. On the re-run after the category prompt the
    // row is already queued and already counted against \`remaining\`, so
    // re-checking here would throw "limit reached" at the exact moment the user
    // answers the prompt on their last free auto-log, discarding their pick.
    let isRerun = mergeIntoId != nil
    if !isRerun, AutoLogStore.remaining(catalog: catalog) <= 0 {
      throw AutoLogError.limitReached
    }

    // Queue first, ask second. This is what makes the tap survive an ignored
    // prompt: the row already exists (with whatever category we know) before
    // any UI is requested. \`mergeIntoId\` is what keeps the re-run from doubling
    // it — see AutoLogStore.upsertProvisional.
    let id = AutoLogStore.upsertProvisional(
      amountRaw: amount,
      merchant: merchant,
      cardName: card,
      accountId: account?.id,
      categoryId: category?.id,
      mergeIntoId: mergeIntoId
    )

    // Only for a brand-new tap. The re-run after the category prompt is the
    // same purchase, and notifying again would read as a double charge.
    if !isRerun {
      AutoLogStore.notifyLogged(catalog: catalog, amountRaw: amount, merchant: merchant)
    }

    // Preset at setup time, or answered and re-run: nothing left to ask.
    if let category = category {
      AutoLogStore.finalize(id: id, categoryId: category.id)
      return .result()
    }

    // Auto-categorize on (the default): no category was preset, so leave it
    // blank and let the app pick one from the merchant name when it drains —
    // never prompting on pay. Settle the row now (categoryId stays nil) so it
    // drains immediately instead of waiting out the category-prompt window.
    if catalog.autoCategorizeByMerchant != false {
      AutoLogStore.finalize(id: id, categoryId: nil)
      return .result()
    }

    let options = AutoLogStore.pickerCategories(catalog: catalog).map {
      AutoLogCategoryEntity(id: $0.id, name: $0.name)
    }
    guard !options.isEmpty else { return .result() }

    // Must be allowed to throw: App Intents catches it, prompts, and re-invokes
    // perform() with \`category\` populated, which returns above. If the user
    // never answers, the row queued above simply drains with the default
    // category. Handling a returned value too keeps this correct whichever way
    // the framework resolves the request.
    let picked = try await $category.requestDisambiguation(
      among: options,
      dialog: "Which category?"
    )
    AutoLogStore.finalize(id: id, categoryId: picked.id)
    return .result()
  }
}
`;

const NEW_TRANSACTION_INTENT_SWIFT = `import AppIntents
import Foundation
import UIKit

/// Mode B: opens whichever entry flow the user chose in Auto-log settings, by
/// deep link — so the app's existing add-action dispatcher does the work and no
/// routing is duplicated here. It adds nothing on its own.
///
/// Any trigger can run this; Back Tap is only the example the in-app setup
/// walks through. Back Tap lists saved shortcuts rather than raw actions, so
/// that example has to wrap this intent in a one-action shortcut first.
///
/// The struct name is this intent's identity to iOS — renaming it orphans the
/// action in every shortcut already built on it. \`title\` is safe to reword.
/// It has no string catalog behind it, so Shortcuts shows this English literal
/// in every locale; \`NEW_TRANSACTION_INTENT_NAME\` in constants/autoLogIntents.ts
/// mirrors it so Settings names the same action the user has to go find.
///
/// Generated by plugins/withMoney2TimeAutoLog.js — edit the plugin, not this file.
struct NewTransactionIntent: AppIntent {
  static var title: LocalizedStringResource = "New Transaction"

  static var description = IntentDescription(
    "Open Money2Time on the entry screen you picked in Auto-log settings.",
    categoryName: "Transactions"
  )

  static var openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    // No catalog yet (app never opened) still opens quick entry rather than
    // doing nothing — a gesture that silently no-ops reads as broken.
    let action = AutoLogStore.loadCatalog()?.backTapAction ?? "${DEFAULT_BACK_TAP_ACTION}"
    if let url = URL(string: "${ADD_URL_PREFIX}\\(action)") {
      await UIApplication.shared.open(url)
    }
    return .result()
  }
}
`;

const SCAN_SCREENSHOT_INTENT_SWIFT = `import AppIntents
import Foundation

/// Mode C: hands a payment screenshot (bank app, wallet confirmation, card
/// notification, or a photographed receipt) to the app, which scans it in the
/// background and logs the transaction automatically — detecting the account
/// from the payment source shown on screen when possible.
///
/// Two ways to reach it, both plain Shortcuts compositions around this one
/// action: a shortcut that grabs the latest screenshot (run manually, via Back
/// Tap, or after a "Take Screenshot" action), or a shortcut that receives
/// images from the share sheet ("send screenshot to app"). The intent itself
/// stays deliberately dumb — write the image into the App Group, queue a
/// handle, and open the app, whose normal receipt-scan pipeline (Worker OCR,
/// quota, account/category resolution) does all the real work.
///
/// The struct name is this intent's identity to iOS — renaming it orphans the
/// action in every shortcut already built on it. \`title\` is safe to reword.
/// It has no string catalog behind it, so Shortcuts shows this English literal
/// in every locale; \`SCAN_SCREENSHOT_INTENT_NAME\` in constants/autoLogIntents.ts
/// mirrors it so Settings names the same action the user has to go find.
///
/// Generated by plugins/withMoney2TimeAutoLog.js — edit the plugin, not this file.
struct ScanScreenshotIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Screenshot"

  static var description = IntentDescription(
    "Send a payment screenshot to Money2Time. The app reads the amount, merchant and account from it and logs the transaction automatically.",
    categoryName: "Transactions"
  )

  /// Opens the app: the OCR round trip needs the app running in the
  /// foreground, and opening it is what makes the queued screenshot drain
  /// within a second or two of the shortcut running.
  static var openAppWhenRun: Bool = true

  // supportedTypeIdentifiers (UTI strings), not supportedContentTypes ([UTType]):
  // the latter only binds to an initializer added in iOS 18, which would break
  // the app's 16.4 deployment target. This string form is available since 16.0.
  @Parameter(title: "Screenshot", supportedTypeIdentifiers: ["public.image"])
  var screenshot: IntentFile

  static var parameterSummary: some ParameterSummary {
    Summary("Log transaction from \\(\\.$screenshot)")
  }

  func perform() async throws -> some IntentResult {
    // Same guard as Log Card Payment: an app never opened has nothing to scan
    // with (no user id, no onboarding), so say that instead of queueing into
    // the void.
    guard AutoLogStore.loadCatalog() != nil else {
      throw AutoLogError.notReady
    }

    let data = screenshot.data
    guard !data.isEmpty else {
      throw AutoLogError.screenshotFailed
    }

    // Keep the original container where possible — the app re-encodes to JPEG
    // when it stores the receipt copy anyway — but never trust an arbitrary
    // extension into a filename.
    let ext = (screenshot.filename as NSString).pathExtension.lowercased()
    let safeExt = ["jpg", "jpeg", "png", "heic", "webp"].contains(ext) ? ext : "jpg"

    guard AutoLogStore.enqueueScreenshot(data: data, fileExtension: safeExt) != nil else {
      throw AutoLogError.screenshotFailed
    }
    return .result()
  }
}
`;

const APP_SHORTCUTS_SWIFT = `import AppIntents

/// Surfaces the intents in the Shortcuts app and Siri without any setup.
///
/// Only the open-the-app intent is offered as a phrase: LogCardPaymentIntent
/// needs an Amount from the automation trigger, so it is not something worth
/// asking Siri for. It is still available in the Shortcuts action list.
///
/// Generated by plugins/withMoney2TimeAutoLog.js — edit the plugin, not this file.
struct Money2TimeAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: NewTransactionIntent(),
      phrases: [
        "New transaction in \\(.applicationName)",
        "Add a transaction in \\(.applicationName)",
        "Log an expense in \\(.applicationName)",
      ],
      shortTitle: "New Transaction",
      systemImageName: "plus.circle.fill"
    )
  }
}
`;

const AUTO_LOG_MODULE_SWIFT = `import Foundation
import React

/// React Native bridge to the auto-log App Group store. Mirrors
/// Money2TimeWidgetModule.swift.
///
/// Generated by plugins/withMoney2TimeAutoLog.js — edit the plugin, not this file.
@objc(Money2TimeAutoLog)
class Money2TimeAutoLog: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(writeCatalog:resolver:rejecter:)
  func writeCatalog(
    _ json: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = AutoLogStore.defaults else {
      reject("autolog_app_group_unavailable", "Money2Time App Group is unavailable.", nil)
      return
    }

    defaults.set(json, forKey: AutoLogStore.catalogKey)
    defaults.synchronize()
    resolve(nil)
  }

  @objc(readPending:rejecter:)
  func readPending(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = AutoLogStore.defaults else {
      reject("autolog_app_group_unavailable", "Money2Time App Group is unavailable.", nil)
      return
    }

    resolve(defaults.string(forKey: AutoLogStore.pendingKey))
  }

  @objc(clearPending:resolver:rejecter:)
  func clearPending(
    _ ids: [String],
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    AutoLogStore.clearPending(ids: ids)
    resolve(nil)
  }

  /// Queued screenshots, enriched with each image's absolute path so the JS
  /// side can copy it into the receipt store without a second native call.
  @objc(readPendingScans:rejecter:)
  func readPendingScans(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard AutoLogStore.defaults != nil else {
      reject("autolog_app_group_unavailable", "Money2Time App Group is unavailable.", nil)
      return
    }

    struct EnrichedScan: Codable {
      let id: String
      let createdAt: String
      let path: String
    }

    guard let dir = AutoLogStore.scansDirectory() else {
      resolve("[]")
      return
    }
    let enriched = AutoLogStore.loadPendingScans().map { entry in
      EnrichedScan(
        id: entry.id,
        createdAt: entry.createdAt,
        path: dir.appendingPathComponent(entry.filename).path
      )
    }
    guard
      let data = try? JSONEncoder().encode(enriched),
      let json = String(data: data, encoding: .utf8)
    else {
      resolve("[]")
      return
    }
    resolve(json)
  }

  @objc(clearPendingScans:resolver:rejecter:)
  func clearPendingScans(
    _ ids: [String],
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    AutoLogStore.clearPendingScans(ids: ids)
    resolve(nil)
  }

  #if DEBUG
  /// Queue a tap exactly as LogCardPaymentIntent would, for the dev-only test
  /// button. A simulator has neither NFC nor the Shortcuts app, so this is the
  /// only way to exercise the real queue-and-drain path there.
  ///
  /// It calls the same \`upsertProvisional\` the intent does, then settles the row
  /// so the drain posts it immediately rather than waiting out the
  /// category-prompt window.
  @objc(enqueueTestTap:merchant:card:resolver:rejecter:)
  func enqueueTestTap(
    _ amountRaw: String,
    merchant: String?,
    card: String?,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let id = AutoLogStore.upsertProvisional(
      amountRaw: amountRaw,
      merchant: merchant,
      cardName: card,
      accountId: nil,
      categoryId: nil,
      mergeIntoId: nil
    )
    AutoLogStore.finalize(id: id, categoryId: nil)
    resolve(id)
  }
  #endif
}
`;

const AUTO_LOG_MODULE_OBJC = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Money2TimeAutoLog, NSObject)

RCT_EXTERN_METHOD(writeCatalog:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(readPending:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearPending:(NSArray *)ids
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(readPendingScans:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearPendingScans:(NSArray *)ids
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

#if DEBUG
RCT_EXTERN_METHOD(enqueueTestTap:(NSString *)amountRaw
                  merchant:(NSString *)merchant
                  card:(NSString *)card
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
#endif

@end
`;

// ---------------------------------------------------------------------------
// Mods
// ---------------------------------------------------------------------------

function addIosAutoLogFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const appRoot = path.join(cfg.modRequest.projectRoot, 'ios', IOS_APP_TARGET_NAME);

      for (const stale of STALE_SWIFT_SOURCES) {
        const stalePath = path.join(appRoot, stale);
        if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
      }

      writeFileIfChanged(path.join(appRoot, 'Money2TimeAutoLogStore.swift'), AUTO_LOG_STORE_SWIFT);
      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeAutoLogEntities.swift'),
        AUTO_LOG_ENTITIES_SWIFT,
      );
      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeLogCardPaymentIntent.swift'),
        LOG_CARD_PAYMENT_INTENT_SWIFT,
      );
      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeNewTransactionIntent.swift'),
        NEW_TRANSACTION_INTENT_SWIFT,
      );
      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeScanScreenshotIntent.swift'),
        SCAN_SCREENSHOT_INTENT_SWIFT,
      );
      writeFileIfChanged(path.join(appRoot, 'Money2TimeAppShortcuts.swift'), APP_SHORTCUTS_SWIFT);
      writeFileIfChanged(
        path.join(appRoot, 'Money2TimeAutoLogModule.swift'),
        AUTO_LOG_MODULE_SWIFT,
      );
      writeFileIfChanged(path.join(appRoot, 'Money2TimeAutoLogModule.m'), AUTO_LOG_MODULE_OBJC);

      return cfg;
    },
  ]);
}

/**
 * The widget plugin already adds this group, but `app.config.ts` strips that
 * plugin from the dev variant — so auto-log has to add it itself or dev builds
 * lose the App Group entirely. Idempotent, so the two can overlap safely.
 */
function addIosAutoLogEntitlements(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults['com.apple.security.application-groups'] ?? [];
    if (!groups.includes(APP_GROUP)) {
      cfg.modResults['com.apple.security.application-groups'] = [...groups, APP_GROUP];
    }
    return cfg;
  });
}

function ensureIosAutoLogSources(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const appTarget = findNativeTargetByName(project, IOS_APP_TARGET_NAME);
    if (!appTarget) return cfg;

    const appGroupKey = getOrCreateGroup(project, IOS_APP_TARGET_NAME, IOS_APP_TARGET_NAME);

    for (const stale of STALE_SWIFT_SOURCES) {
      removeSourceFileIfPresent(
        project,
        `${IOS_APP_TARGET_NAME}/${stale}`,
        appTarget.uuid,
        appGroupKey,
      );
    }

    for (const source of SWIFT_SOURCES) {
      ensureSourceFile(project, `${IOS_APP_TARGET_NAME}/${source}`, appTarget.uuid, appGroupKey);
    }
    ensureSourceFile(
      project,
      `${IOS_APP_TARGET_NAME}/Money2TimeAutoLogModule.m`,
      appTarget.uuid,
      appGroupKey,
    );

    return cfg;
  });
}

module.exports = function withMoney2TimeAutoLog(config) {
  config = addIosAutoLogEntitlements(config);
  // Dangerous mods run before xcodeproj mods, so the files exist by the time
  // the project references them.
  config = addIosAutoLogFiles(config);
  config = ensureIosAutoLogSources(config);
  return config;
};
