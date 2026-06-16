import 'package:freezed_annotation/freezed_annotation.dart';

part 'notification_state.freezed.dart';
part 'notification_state.g.dart';

@freezed
class NotificationState with _$NotificationState {
  factory NotificationState(
      {required bool hasEventNotifications,
      required bool hasNewMessageNotifications,
      required bool hasAssignmentStatusNotifications}) = _NotificationState;

  factory NotificationState.fromJson(Map<String, dynamic> json) =>
      _$NotificationStateFromJson(json);
}
