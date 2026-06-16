import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:betterlectio/notifications/history/history_entry.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _listKey = "dk.betterlectio.android.notification.history";

class NotificationHistory {
  save(bool error, bool newData) async {
    var entry =
        HistoryEntry(time: DateTime.now(), error: error, newData: newData);

    var prefs = await SharedPreferences.getInstance();
    var currentEntries = await entries();
    currentEntries.add(entry);
    if (currentEntries.length > 20) {
      currentEntries = currentEntries.sublist(1);
    }
    await prefs.setStringList(_listKey,
        currentEntries.map((entry) => json.encode(entry.toJson())).toList());
    debugPrint("wrote notification history");
  }

  Future<List<HistoryEntry>> entries() async {
    var prefs = await SharedPreferences.getInstance();
    var currentData = prefs.getStringList(_listKey) ?? [];
    var currentEntries = currentData
        .map((data) => HistoryEntry.fromJson(json.decode(data)))
        .toList();
    return currentEntries;
  }
}
