import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio/student.dart';
import 'package:lectio_wrapper/types/assignment.dart';
import 'package:betterlectio/notifications/handlers/notification_service.dart';
import 'package:betterlectio/notifications/service.dart';

const _assignmentLocalKey = "notifications.assignments";

class AssignmentNotificationHandler extends NotificationHandler<AssignmentRef> {
  AssignmentNotificationHandler() : super(localKey: _assignmentLocalKey);

  @override
  List<PendingNotification> compare() {
    List<PendingNotification> newNotifications = [];
    for (var onlineRef in onlineObjects) {
      var localRefMatch = localObjects
          .where((localRef) => localRef.id == onlineRef.id)
          .firstOrNull;
      var localAwaits = localRefMatch?.awaits.trim();
      var onlineAwaits = onlineRef.awaits.trim();
      if (localAwaits != null &&
          localAwaits != onlineAwaits &&
          onlineAwaits.isEmpty) {
        newNotifications.add(PendingNotification(
            id: onlineRef.id,
            title: "Opgave afsluttet",
            body: "Opgaven ${onlineRef.title} er afsluttet."));
      }
    }
    return newNotifications;
  }

  @override
  Future<bool> loadOnline(Student student) async {
    try {
      var assignmentRefs = await student.assignments.list();
      if (assignmentRefs.isNotEmpty) {
        onlineObjects = assignmentRefs;
        return true;
      }
    } catch (error) {
      debugPrint(error.toString());
    }
    return false;
  }
}
