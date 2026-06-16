import 'dart:convert';
import 'dart:io';

import 'package:disable_battery_optimizations_latest/disable_battery_optimizations_latest.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:betterlectio/topics/settings/bloc/notification_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

const notificationConfigKey = "notification.config";

class NotificationBloc extends Cubit<NotificationState> {
  NotificationBloc()
      : super(NotificationState(
            hasEventNotifications: false,
            hasNewMessageNotifications: false,
            hasAssignmentStatusNotifications: false)) {
    _loadLocal();
  }

  void _loadLocal() async {
    try {
      var prefs = await SharedPreferences.getInstance();
      var loadedMap = json.decode(prefs.getString(notificationConfigKey) ?? "");
      if (loadedMap != null) {
        NotificationState? config = NotificationState.fromJson(loadedMap);
        emit(config);
      }
    } catch (error) {
      debugPrint(error.toString());
    }
    if (!state.hasAssignmentStatusNotifications &&
        !state.hasEventNotifications &&
        !state.hasNewMessageNotifications) {
      emit(state.copyWith(
          hasAssignmentStatusNotifications: true,
          hasEventNotifications: true,
          hasNewMessageNotifications: true));
      checkNotifications();
    }
    await checkBatteryOptimization();
  }

  Future<bool> isGrantedNotfications() async {
    FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
        FlutterLocalNotificationsPlugin();
    bool? requestResult;
    if (Platform.isAndroid) {
      requestResult = await flutterLocalNotificationsPlugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()!
          .requestNotificationsPermission();
      
    } else {
      requestResult = await flutterLocalNotificationsPlugin
          .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(
            alert: true,
            badge: true,
            sound: true,
          );
    }
    return requestResult ?? false;
  }

  Future<void> checkBatteryOptimization() async {
    if(Platform.isAndroid){
      bool? isBatteryOptimizationDisabled = await DisableBatteryOptimizationLatest.isBatteryOptimizationDisabled;
      debugPrint("BATTERY OPTIMIZATION: $isBatteryOptimizationDisabled");
      if(isBatteryOptimizationDisabled != true){
         await DisableBatteryOptimizationLatest.showDisableBatteryOptimizationSettings();
      }
    }
  }

  void checkNotifications() async {
    if (!(await isGrantedNotfications())) {
      emit(state.copyWith(
          hasAssignmentStatusNotifications: false,
          hasEventNotifications: false,
          hasNewMessageNotifications: false));
    }
    var prefs = await SharedPreferences.getInstance();
    await prefs.setString(notificationConfigKey, json.encode(state));
  }

  void toggleAssignmentStatusNotifications() {
    emit(state.copyWith(
        hasAssignmentStatusNotifications:
            !state.hasAssignmentStatusNotifications));
    checkNotifications();
  }

  void toggleEventNotifications() {
    emit(state.copyWith(hasEventNotifications: !state.hasEventNotifications));
    checkNotifications();
  }

  void toggleNewMessageNotifications() {
    emit(state.copyWith(
        hasNewMessageNotifications: !state.hasNewMessageNotifications));
    checkNotifications();
  }
}
