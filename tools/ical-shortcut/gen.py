import plistlib, uuid, sys

ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbW5mY210YnBlYWNjbnlpbmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODQ3MjksImV4cCI6MjA5Mzk2MDcyOX0.flUt1SAkkt1ppcKCR2XnPKbAaS4PjCLMzi3Gu08jVWo")
OBJ = "￼"  # object replacement char = token slot

def U(): return str(uuid.uuid4()).upper()
def act(ident, **params): return {"WFWorkflowActionIdentifier": ident, "WFWorkflowActionParameters": params}
def out(name, uid): return {"OutputName": name, "OutputUUID": uid, "Type": "ActionOutput"}
def tok_str(s, attachments=None):
    v = {"string": s}
    if attachments: v["attachmentsByRange"] = attachments
    return {"Value": v, "WFSerializationType": "WFTextTokenString"}
def ref(name, uid):  # a text that is just one action output
    return tok_str(OBJ, {"{0, 1}": out(name, uid)})
def attach(name, uid): return {"Value": out(name, uid), "WFSerializationType": "WFTextTokenAttachment"}
def var(name): return {"Value": {"Type": "Variable", "VariableName": name}, "WFSerializationType": "WFTextTokenAttachment"}
def dict_items(pairs):  # [(key, valueTokenString)]
    return {"Value": {"WFDictionaryFieldValueItems": [
        {"WFItemType": 0, "WFKey": tok_str(k), "WFValue": v} for k, v in pairs]},
        "WFSerializationType": "WFDictionaryFieldValue"}
def headers(json_ct=False):
    h = [("apikey", tok_str(ANON)), ("Authorization", tok_str("Bearer " + ANON))]
    if json_ct: h.append(("Content-Type", tok_str("application/json")))
    return dict_items(h)

def build(base):
    a = []
    d = U(); a.append(act("is.workflow.actions.date", UUID=d))
    # Clear TOMORROW..+6, never today: the grab below is "next 7 days from run
    # time", so clearing today would erase this morning's meetings on a midday
    # run. Today is handled by the function (clearMatch dedupe + sweepStale).
    tom = U(); a.append(act("is.workflow.actions.adjustdate", UUID=tom,
        WFDate=ref("Date", d), WFAdjustOperation="Add",
        WFDuration={"Value": {"Magnitude": "1", "Unit": "days"}, "WFSerializationType": "WFQuantityFieldValue"}))
    tomorrow = U(); a.append(act("is.workflow.actions.format.date", UUID=tomorrow,
        WFDate=ref("Adjusted Date", tom), WFDateFormatStyle="Custom", WFDateFormat="yyyy-MM-dd"))
    url = f"{base}?from={OBJ}&days=6"
    a.append(act("is.workflow.actions.downloadurl", UUID=U(), ShowHeaders=True, WFHTTPMethod="DELETE",
        WFHTTPHeaders=headers(),
        WFURL=tok_str(url, {f"{{{url.index(OBJ)}, 1}}": out("Formatted Date", tomorrow)})))
    ev = U(); a.append(act("is.workflow.actions.filter.calendarevents", UUID=ev,
        WFContentItemFilter={"Value": {
            "WFActionParameterFilterPrefix": 1,
            "WFActionParameterFilterTemplates": [
                {"Bounded": True, "Operator": 1000, "Property": "Start Date", "Removable": False,
                 "Values": {"Number": "7", "Unit": 16}},
                {"Operator": 4, "Property": "Is All Day", "Removable": True, "Values": {"Bool": False}},
            ],
            "WFContentPredicateBoundedDate": False},
            "WFSerializationType": "WFContentPredicateTableTemplate"},
        WFContentItemLimitEnabled=False, WFContentItemSortOrder="Oldest First", WFContentItemSortProperty="Start Date"))
    grp = U()
    a.append(act("is.workflow.actions.repeat.each", GroupingIdentifier=grp, WFControlFlowMode=0,
        WFInput=attach("Calendar Events", ev)))
    sd = U(); a.append(act("is.workflow.actions.properties.calendarevents", UUID=sd, WFContentItemPropertyName="Start Date", WFInput=var("Repeat Item")))
    ed = U(); a.append(act("is.workflow.actions.properties.calendarevents", UUID=ed, WFContentItemPropertyName="End Date", WFInput=var("Repeat Item")))
    ti = U(); a.append(act("is.workflow.actions.properties.calendarevents", UUID=ti, WFContentItemPropertyName="Title", WFInput=var("Repeat Item")))
    FMT = "yyyy-MM-dd'T'HH:mm"
    fs = U(); a.append(act("is.workflow.actions.format.date", UUID=fs, WFDate=ref("Start Date", sd), WFDateFormatStyle="Custom", WFDateFormat=FMT))
    fe = U(); a.append(act("is.workflow.actions.format.date", UUID=fe, WFDate=ref("End Date", ed), WFDateFormatStyle="Custom", WFDateFormat=FMT))
    a.append(act("is.workflow.actions.downloadurl", UUID=U(), ShowHeaders=True, WFHTTPMethod="POST",
        WFHTTPHeaders=headers(json_ct=True), WFURL=base,
        WFJSONValues=dict_items([
            ("start", ref("Formatted Date", fs)),
            ("end", ref("Formatted Date", fe)),
            ("title", ref("Title", ti)),
        ])))
    a.append(act("is.workflow.actions.repeat.each", GroupingIdentifier=grp, UUID=U(), WFControlFlowMode=2))
    return {
        "WFWorkflowActions": a,
        "WFWorkflowClientVersion": "2607.0.3",
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 59771, "WFWorkflowIconStartColor": 463140863},
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
    }

for name, base in [("test", "http://127.0.0.1:8799/functions/v1/ical-ingest"),
                   ("prod", "https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/ical-ingest")]:
    with open(f"{name}-unsigned.shortcut", "wb") as f: plistlib.dump(build(base), f, fmt=plistlib.FMT_BINARY)
    print("wrote", name)
