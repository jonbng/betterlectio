import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/assignment.dart';
import 'package:lectio_wrapper/types/message/message.dart';
import 'package:betterlectio/notifications/service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class NotificationHandler<T> {
  final String _localKey;
  List<T> localObjects = [];
  List<T> onlineObjects = [];

  T? fromJson(dynamic json) {
    switch (T) {
      case CalendarEvent _:
        return CalendarEvent.fromJson(json) as T;
      case AssignmentRef _:
        return AssignmentRef.fromJson(json) as T;
      case MessageRef _:
        return MessageRef.fromJson(json) as T;
      default:
        return null;
    }
  }

  dynamic toJson(T obj) {
    switch (T) {
      case const (CalendarEvent):
        return (obj as CalendarEvent).toJson();
      case const (AssignmentRef):
        return (obj as AssignmentRef).toJson();
      case const (MessageRef):
        return (obj as MessageRef).toJson();
      default:
        return null;
    }
  }

  NotificationHandler({required String localKey}) : _localKey = localKey;
  bool loadLocal(SharedPreferences prefs) {
    try {
      var dataList = prefs.getStringList(_localKey);
      if (dataList != null) {
        var localEvents = dataList.map((data) {
          var dataJson = json.decode(data);
          var parsed = fromJson(dataJson);
          return parsed!;
        }).toList();
        localObjects = localEvents;
        return true;
      }
    } catch (error) {
      debugPrint(error.toString());
    }
    return false;
  }

  ///
  /// Returns true if an online version can be read
  ///
  Future<bool> loadOnline(Student student) {
    throw UnimplementedError();
  }

  ///
  /// Compares the `localEvents` and the `onlineEvents` and returns a list of notifications to be displayed
  ///
  List<PendingNotification> compare() {
    throw UnimplementedError();
  }

  Future<void> save(SharedPreferences prefs) async {
    if (onlineObjects.isNotEmpty) {
      try {
        List<String> stringList = [];
        for (var onlineEvent in onlineObjects) {
          var str = toJson(onlineEvent);
          if (str != null) {
            stringList.add(json.encode(str));
          }
        }

        await prefs.setStringList(_localKey, stringList);
      } catch (error) {
        debugPrint(error.toString());
      }
    }
  }

  Future<void> reset(SharedPreferences prefs) async {
    try {
      await prefs.setStringList(_localKey, []);
    } catch (error) {
      debugPrint(error.toString());
    }
  }
}
