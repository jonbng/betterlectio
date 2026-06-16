import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/utils/dating.dart';
import 'package:betterlectio/notifications/handlers/notification_service.dart';
import 'package:betterlectio/notifications/service.dart';

const _eventLocalKey = "notifications.events";

class EventNotificationHandler extends NotificationHandler<CalendarEvent> {
  EventNotificationHandler() : super(localKey: _eventLocalKey);

  @override
  List<PendingNotification> compare() {
    List<PendingNotification> notifications = [];
    for (var localEvent in localObjects) {
      var onlineMatch = onlineObjects
          .where((onlineEvent) => onlineEvent.id == localEvent.id)
          .firstOrNull;
      if (onlineMatch != null) {
        if (onlineMatch.status != localEvent.status) {
          String title = "Modul ${onlineMatch.status.toLowerCase()}";
          String body =
              "Modulet ${onlineMatch.team} d. ${DateFormat("dd/MM HH:mm").format(onlineMatch.start)} er blevet ${onlineMatch.status.toLowerCase()}";
          notifications.add(PendingNotification(
              id: onlineMatch.id, title: title, body: body));
        }
      }
    }
    return notifications;
  }

  @override
  Future<bool> loadOnline(Student student) async {
    try {
      var now = DateTime.now();
      var weekNumber = weekFromDateTime(now);
      var week = await student.weeks.get(now.year, weekNumber);
      var events = week.days
          .map((day) => day.events)
          .expand((events) => events)
          .toList();
      if (events.isNotEmpty) {
        onlineObjects = events;
        return true;
      }
    } catch (error) {
      debugPrint(error.toString());
    }
    return false;
  }
}
