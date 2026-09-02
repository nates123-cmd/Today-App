#!/usr/bin/env python3
"""Generate "Push Reminders to Today" as an unsigned WFWorkflow plist.

Design notes (both chosen to minimise fragile plist):
  * One POST per reminder (the flat single-reminder shape the edge function
    already supports) instead of building a JSON array in a variable.
    Array-building needs Add-to-Variable plus a nested dictionary-in-dictionary
    body, which is the most error-prone corner of the format.
  * DELETE ?all=1 up front instead of a per-list filter, so no
    WFContentItemFilter template is needed at all. Each reminder carries its own
    List name, so Today still knows where each came from.

Actions:
  1. Get Contents of URL   DELETE ?all=1
  2. Find Reminders        (no filter — `completed` is sent per reminder and the
                            app hides completed ones)
  3. Repeat with Each
  4.   Get Contents of URL POST {id,title,due,notes,list,completed}
  5. End Repeat
"""
import plistlib
import sys
import uuid

OUT = sys.argv[1]
ENV = sys.argv[2]

anon = None
for line in open(ENV):
    if line.startswith("VITE_SUPABASE_ANON_KEY="):
        anon = line.split("=", 1)[1].strip()
if not anon:
    raise SystemExit("anon key not found in .env")

BASE = "https://xsmnfcmtbpeaccnyinkr.supabase.co/functions/v1/reminders-ingest"
OBJ = "￼"  # OBJECT REPLACEMENT CHARACTER — the placeholder a token attaches to


def text(s):
    return {"Value": {"string": s}, "WFSerializationType": "WFTextTokenString"}


def repeat_item(prop):
    """The Repeat Item magic variable narrowed to one of its properties."""
    return {
        "Type": "Variable",
        "VariableName": "Repeat Item",
        "Aggrandizements": [
            {"Type": "WFPropertyVariableAggrandizement", "PropertyName": prop}
        ],
    }


def token_field(tok):
    """A field whose entire contents is a single variable token."""
    return {
        "Value": {"string": OBJ, "attachmentsByRange": {"{0, 1}": tok}},
        "WFSerializationType": "WFTextTokenString",
    }


def dict_field(pairs):
    items = [{"WFItemType": 0, "WFKey": text(k), "WFValue": v} for k, v in pairs]
    return {
        "Value": {"WFDictionaryFieldValueItems": items},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def action(ident, params):
    params = dict(params)
    params.setdefault("UUID", str(uuid.uuid4()).upper())
    return {"WFWorkflowActionIdentifier": ident, "WFWorkflowActionParameters": params}


HEADERS = dict_field(
    [("apikey", text(anon)), ("Authorization", text("Bearer " + anon))]
)

group = str(uuid.uuid4()).upper()

actions = [
    action(
        "is.workflow.actions.downloadurl",
        {
            "WFURL": text(BASE + "?all=1"),
            "WFHTTPMethod": "DELETE",
            "WFHTTPHeaders": HEADERS,
            "ShowHeaders": True,
        },
    ),
    action("is.workflow.actions.filter.reminders", {}),
    action(
        "is.workflow.actions.repeat.each",
        {"GroupingIdentifier": group, "WFControlFlowMode": 0},
    ),
    action(
        "is.workflow.actions.downloadurl",
        {
            "WFURL": text(BASE),
            "WFHTTPMethod": "POST",
            "WFHTTPHeaders": HEADERS,
            "WFHTTPBodyType": "Json",
            "WFJSONValues": dict_field(
                [
                    ("id", token_field(repeat_item("Identifier"))),
                    ("title", token_field(repeat_item("Name"))),
                    ("due", token_field(repeat_item("Due Date"))),
                    ("notes", token_field(repeat_item("Notes"))),
                    ("list", token_field(repeat_item("List"))),
                    ("completed", token_field(repeat_item("Is Completed"))),
                ]
            ),
            "ShowHeaders": True,
        },
    ),
    action(
        "is.workflow.actions.repeat.each",
        {"GroupingIdentifier": group, "WFControlFlowMode": 2},
    ),
]

wf = {
    "WFWorkflowClientVersion": "2605.0.5",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {
        "WFWorkflowIconStartColor": 4282601983,
        "WFWorkflowIconGlyphNumber": 59511,
    },
    "WFWorkflowImportQuestions": [],
    "WFWorkflowTypes": [],
    "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
    "WFWorkflowActions": actions,
}

with open(OUT, "wb") as f:
    plistlib.dump(wf, f)
print("wrote %s (%d actions)" % (OUT, len(actions)))
