// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$NotificationStateImpl _$$NotificationStateImplFromJson(
        Map<String, dynamic> json) =>
    _$NotificationStateImpl(
      hasEventNotifications: json['hasEventNotifications'] as bool,
      hasNewMessageNotifications: json['hasNewMessageNotifications'] as bool,
      hasAssignmentStatusNotifications:
          json['hasAssignmentStatusNotifications'] as bool,
    );

Map<String, dynamic> _$$NotificationStateImplToJson(
        _$NotificationStateImpl instance) =>
    <String, dynamic>{
      'hasEventNotifications': instance.hasEventNotifications,
      'hasNewMessageNotifications': instance.hasNewMessageNotifications,
      'hasAssignmentStatusNotifications':
          instance.hasAssignmentStatusNotifications,
    };
