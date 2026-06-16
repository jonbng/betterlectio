import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio/student.dart';
import 'package:lectio_wrapper/types/message/message.dart';
import 'package:betterlectio/notifications/handlers/notification_service.dart';
import 'package:betterlectio/notifications/service.dart';

const _messageLocalKey = "notifications.messages";

class MessageNotificationHandler extends NotificationHandler<MessageRef> {
  MessageNotificationHandler() : super(localKey: _messageLocalKey);

  @override
  List<PendingNotification> compare() {
    List<PendingNotification> notifications = [];
    for (var onlineMessage in onlineObjects) {
      var localMessageMatch = localObjects
          .where((localMessage) => localMessage.id == onlineMessage.id)
          .firstOrNull;
      if (localMessageMatch == null) {
        notifications.add(PendingNotification(
            id: onlineMessage.id,
            title: "Ny besked",
            body: 'Du har modtaget en ny besked: ${onlineMessage.topic}'));
      }
    }
    return notifications;
  }

  @override
  Future<bool> loadOnline(Student student) async {
    try {
      var messages = await student.messages.list();
      if (messages.isNotEmpty) {
        onlineObjects = messages;
        return true;
      }
    } catch (error) {
      debugPrint(error.toString());
    }
    return false;
  }
}
