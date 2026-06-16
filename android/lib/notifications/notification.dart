import 'dart:async';
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:betterlectio/constants.dart';
import 'package:betterlectio/notifications/history/history.dart';
import 'package:betterlectio/notifications/service.dart';
import 'package:workmanager/workmanager.dart';

const notificationChannelId = 'betterlectio';
const notificationId = 0;

@pragma('vm:entry-point')
Future<void> callbackDispatcher() async {
  Workmanager().executeTask((task, inputData) async {
    final startTime = DateTime.now();
    debugPrint('🚀 Task started: $task');
    debugPrint('📊 Input data: $inputData');

    try {
      await handleNotifications();

      final duration = DateTime.now().difference(startTime);
      debugPrint('✅ Task completed in ${duration.inSeconds}s');
    } catch (e, stackTrace) {
      final duration = DateTime.now().difference(startTime);
      debugPrint('❌ Task failed after ${duration.inSeconds}s: $e');
      debugPrint('📋 Stack trace: $stackTrace');
    }
    return true;
  });
}

@pragma('vm:entry-point')
Future<void> handleNotifications() async {
  DartPluginRegistrant.ensureInitialized();
  debugPrint("Running notification service");

  bool error = false;
  bool newData = false;
  try {
    var notificationService = NotificationService();
    newData = await notificationService.setup();

    //await notificationService.notify();
    // lets replace this one with a call to our server
    if(newData){
      
    }
  } catch (e) {
    error = true;
  }

  await NotificationHistory().save(error, newData);

  return;
}

Future<FlutterLocalNotificationsPlugin> initializeNotifcations() async {
  const DarwinInitializationSettings initializationSettingsDarwin =
      DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
          notificationCategories: [
        DarwinNotificationCategory(
          appName,
          actions: [],
          options: <DarwinNotificationCategoryOption>{
            DarwinNotificationCategoryOption.hiddenPreviewShowTitle,
          },
        )
      ]);

  const AndroidInitializationSettings androidInitializationSettings =
      AndroidInitializationSettings("@drawable/ic_notification");

  const AndroidNotificationChannel channel = AndroidNotificationChannel(
    notificationChannelId,
    appName,
    description: 'BetterLectio opdateringer',
    importance: Importance.high,
  );

  final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
      FlutterLocalNotificationsPlugin();

  await flutterLocalNotificationsPlugin.initialize(
      settings: const InitializationSettings(
          iOS: initializationSettingsDarwin,
          android: androidInitializationSettings));
  await flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(channel);
  return flutterLocalNotificationsPlugin;
}

Future<void> registerPeriodicTask() async {
  debugPrint("Registered tasks");
  await Workmanager().registerPeriodicTask(
      "dk.betterlectio.android.notification", "Notifications",
      frequency: const Duration(minutes: 20),
      constraints: Constraints(networkType: NetworkType.connected));
}
