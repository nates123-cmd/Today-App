// remkit: Apple Reminders over EventKit, for scripts.
//
// WHY THIS EXISTS instead of osascript: AppleScript drives the Reminders APP
// one Apple Event at a time. Against the ~2,860-item default list a read took
// ~20s-4min, a single add could run past 5 minutes, a -1712 timeout could still
// have written, and shared lists were invisible. EventKit reads the store
// directly: the whole open list comes back in about a second, every reminder
// carries a stable identifier, and shared lists enumerate.
//
// Output is JSON on stdout so callers never parse locale-formatted dates.
// Due dates are WALL-CLOCK text ("2026-09-30" or "2026-09-30 14:30"), the same
// convention today_reminders uses: a reminder is "call the plumber at 2:30",
// not an absolute instant.
//
// Commands:
//   remkit lists
//   remkit list [--list NAME | --all]          open reminders (default list if no flag)
//   remkit get ID
//   remkit add TITLE [--list NAME] [--due "YYYY-MM-DD[ HH:MM]"] [--notes TEXT] [--priority N]
//   remkit complete ID [--note TEXT]           idempotent; --note is appended to the notes
//   remkit uncomplete ID
//
// ID is EKCalendarItem.calendarItemIdentifier.
//
// Exit codes: 0 ok, 2 usage / unknown list, 3 no Reminders access,
//             4 reminder not found, 1 anything else.
//
// Build: tools/remkit/build.sh (embeds an Info.plist so the TCC prompt has a
// usage string). RECOMPILING CHANGES THE BINARY HASH and macOS may ask for
// Reminders access again; a launchd run cannot answer that prompt.

import EventKit
import Foundation

let store = EKEventStore()

func fail(_ msg: String, _ code: Int32) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(code)
}

func emit(_ obj: Any) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]) else {
    fail("json encode failed", 1)
  }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func requestAccess() {
  let sema = DispatchSemaphore(value: 0)
  var granted = false
  store.requestFullAccessToReminders { g, _ in
    granted = g
    sema.signal()
  }
  sema.wait()
  if !granted { fail("NO_ACCESS: grant Reminders in System Settings > Privacy & Security > Reminders", 3) }
}

// --- args -------------------------------------------------------------------

var args = Array(CommandLine.arguments.dropFirst())
guard let cmd = args.first else {
  fail("usage: remkit lists|list|get|add|complete|uncomplete ...", 2)
}
args.removeFirst()

func flag(_ name: String) -> String? {
  guard let i = args.firstIndex(of: name) else { return nil }
  guard i + 1 < args.count else { fail("\(name) needs a value", 2) }
  let v = args[i + 1]
  args.removeSubrange(i...(i + 1))
  return v
}

func bool(_ name: String) -> Bool {
  guard let i = args.firstIndex(of: name) else { return false }
  args.remove(at: i)
  return true
}

// --- formatting -------------------------------------------------------------

let iso: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime]
  return f
}()

func pad(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }

func dueText(_ c: DateComponents?) -> Any {
  guard let c = c, let y = c.year, let m = c.month, let d = c.day else { return NSNull() }
  let day = "\(y)-\(pad(m))-\(pad(d))"
  // Reminders created "all day" have no hour component. Some older ones store
  // 00:00 instead; callers already treat 00:00 as no time.
  guard let h = c.hour else { return day }
  return "\(day) \(pad(h)):\(pad(c.minute ?? 0))"
}

func parseDue(_ s: String) -> DateComponents {
  let parts = s.split(separator: " ", maxSplits: 1).map(String.init)
  let ymd = parts[0].split(separator: "-").compactMap { Int($0) }
  guard ymd.count == 3 else { fail("bad --due, want YYYY-MM-DD[ HH:MM]: \(s)", 2) }
  var c = DateComponents()
  c.calendar = Calendar.current
  c.timeZone = TimeZone.current
  c.year = ymd[0]; c.month = ymd[1]; c.day = ymd[2]
  if parts.count == 2 {
    let hm = parts[1].split(separator: ":").compactMap { Int($0) }
    guard hm.count == 2 else { fail("bad --due time: \(s)", 2) }
    c.hour = hm[0]; c.minute = hm[1]
  }
  return c
}

func json(_ r: EKReminder) -> [String: Any] {
  let cal = r.calendar
  return [
    "id": r.calendarItemIdentifier,
    "external_id": r.calendarItemExternalIdentifier ?? NSNull(),
    "title": r.title ?? "",
    "list": cal?.title ?? NSNull(),
    "list_id": cal?.calendarIdentifier ?? NSNull(),
    "due": dueText(r.dueDateComponents),
    "priority": r.priority,
    "notes": r.notes ?? NSNull(),
    "completed": r.isCompleted,
    "created": r.creationDate.map { iso.string(from: $0) } ?? NSNull(),
    "modified": r.lastModifiedDate.map { iso.string(from: $0) } ?? NSNull(),
  ]
}

// --- lookup -----------------------------------------------------------------

func calendar(named name: String?) -> EKCalendar {
  guard let name = name else {
    guard let def = store.defaultCalendarForNewReminders() else { fail("no default Reminders list", 2) }
    return def
  }
  if let hit = store.calendars(for: .reminder).first(where: { $0.title == name }) { return hit }
  fail("NO_LIST: \(name)", 2)
}

func reminder(_ id: String) -> EKReminder {
  guard let r = store.calendarItem(withIdentifier: id) as? EKReminder else { fail("NOT_FOUND: \(id)", 4) }
  return r
}

func fetch(_ pred: NSPredicate) -> [EKReminder] {
  let sema = DispatchSemaphore(value: 0)
  var out: [EKReminder] = []
  store.fetchReminders(matching: pred) { rems in
    out = rems ?? []
    sema.signal()
  }
  sema.wait()
  return out
}

func save(_ r: EKReminder) {
  do { try store.save(r, commit: true) } catch { fail("save failed: \(error.localizedDescription)", 1) }
}

// --- commands ---------------------------------------------------------------

requestAccess()

switch cmd {
case "lists":
  let def = store.defaultCalendarForNewReminders()?.calendarIdentifier
  emit(store.calendars(for: .reminder).map { c -> [String: Any] in
    ["id": c.calendarIdentifier, "title": c.title, "default": c.calendarIdentifier == def,
     "writable": c.allowsContentModifications, "source": c.source?.title ?? NSNull()]
  })

case "list":
  let all = bool("--all")
  let cals: [EKCalendar]? = all ? nil : [calendar(named: flag("--list"))]
  let pred = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: cals)
  emit(fetch(pred).map(json))

case "get":
  guard let id = args.first else { fail("usage: remkit get ID", 2) }
  emit(json(reminder(id)))

case "add":
  let list = flag("--list")
  let due = flag("--due")
  let notes = flag("--notes")
  let prio = flag("--priority")
  guard let title = args.first, !title.trimmingCharacters(in: .whitespaces).isEmpty else {
    fail("usage: remkit add TITLE [--list NAME] [--due ...] [--notes ...] [--priority N]", 2)
  }
  let r = EKReminder(eventStore: store)
  r.title = title
  r.calendar = calendar(named: list)
  if let due = due {
    let c = parseDue(due)
    r.dueDateComponents = c
    // A timed reminder only pings if it carries an alarm; the Reminders app
    // adds one implicitly, EventKit does not.
    if c.hour != nil, let date = Calendar.current.date(from: c) {
      r.addAlarm(EKAlarm(absoluteDate: date))
    }
  }
  if let notes = notes { r.notes = notes }
  if let prio = prio {
    guard let p = Int(prio) else { fail("bad --priority: \(prio)", 2) }
    r.priority = p
  }
  save(r)
  emit(json(r))

case "complete", "uncomplete":
  let note = flag("--note")
  guard let id = args.first else { fail("usage: remkit \(cmd) ID", 2) }
  let r = reminder(id)
  let want = cmd == "complete"
  var changed = false
  if r.isCompleted != want { r.isCompleted = want; changed = true }
  if let note = note, !(r.notes ?? "").contains(note) {
    r.notes = (r.notes?.isEmpty ?? true) ? note : r.notes! + "\n" + note
    changed = true
  }
  if changed { save(r) }
  emit(json(r))

default:
  fail("unknown command: \(cmd)", 2)
}
