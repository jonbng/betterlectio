import 'dart:convert';
import 'dart:ui';

import 'package:flutter/cupertino.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:betterlectio/constants.dart';
import 'package:betterlectio/logic/cache/login_service.dart';
import 'package:betterlectio/notifications/handlers/assignment_notification_handler.dart';
import 'package:betterlectio/notifications/handlers/event_notification_handler.dart';
import 'package:betterlectio/notifications/handlers/message_notification_handler.dart';
import 'package:betterlectio/notifications/handlers/notification_service.dart';
import 'package:betterlectio/notifications/notification.dart';
import 'package:betterlectio/topics/settings/bloc/notification_bloc.dart';
import 'package:betterlectio/topics/settings/bloc/notification_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PendingNotification {
  String id;
  String title;
  String? body;
  String? payload;
  PendingNotification({required this.id, this.body, required this.title});
}

class NotificationService {
  final LoginService loginService = LoginService();
  late SharedPreferences prefs;
  List<PendingNotification> notifications = [];

  Future<List<PendingNotification>> useHandler(SharedPreferences prefs,
      Student student, NotificationHandler handler) async {
    var hasLocal = handler.loadLocal(prefs);
    if (!hasLocal) {
      await handler.reset(prefs);
    }
    var hasOnline = await handler.loadOnline(student);
    if (hasOnline) {
      await handler.save(prefs);
      if (hasLocal) {
        var newNotifications = handler.compare();
        return newNotifications;
      }
    }

    return [];
  }

  Future<bool> setup() async {
    prefs = await SharedPreferences.getInstance();
    var notificationConfig = prefs.getString(notificationConfigKey);
    var configJson =
        notificationConfig != null ? json.decode(notificationConfig) : null;
    var config =
        configJson != null ? NotificationState.fromJson(configJson) : null;
    if (config != null &&
        (config.hasAssignmentStatusNotifications ||
            config.hasEventNotifications ||
            config.hasNewMessageNotifications)) {
      var student = await loginService.loadSaved();
      if (student != null) {
        // load notifications and show them

        // event notifications
        if (config.hasEventNotifications) {
          var newEventNotifications =
              await useHandler(prefs, student, EventNotificationHandler());
          notifications.addAll(newEventNotifications);
        }

        // assignment notifications
        if (config.hasAssignmentStatusNotifications) {
          var newAssignmentNotifications =
              await useHandler(prefs, student, AssignmentNotificationHandler());
          notifications.addAll(newAssignmentNotifications);
        }

        // message notifications
        if (config.hasNewMessageNotifications) {
          var newMessageNotifications =
              await useHandler(prefs, student, MessageNotificationHandler());
          notifications.addAll(newMessageNotifications);
        }
      }
    }
    return notifications.isNotEmpty;
  }

  Future<void> notify() async {
    DartPluginRegistrant.ensureInitialized();
    WidgetsFlutterBinding.ensureInitialized();
    final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
        await initializeNotifcations();
    for (var notification in notifications) {
      await flutterLocalNotificationsPlugin.show(
        id: notificationId,
        title: notification.title,
        body: notification.body,
        notificationDetails: NotificationDetails(
            android: AndroidNotificationDetails(notificationChannelId, appName,
                ongoing: false, tag: notification.id),
            iOS: DarwinNotificationDetails(
                categoryIdentifier: appName,
                threadIdentifier: notification.id)),
      );
    }
  }
}
