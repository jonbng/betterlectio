// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'history_entry.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$HistoryEntryImpl _$$HistoryEntryImplFromJson(Map<String, dynamic> json) =>
    _$HistoryEntryImpl(
      time: DateTime.parse(json['time'] as String),
      error: json['error'] as bool,
      newData: json['newData'] as bool,
    );

Map<String, dynamic> _$$HistoryEntryImplToJson(_$HistoryEntryImpl instance) =>
    <String, dynamic>{
      'time': instance.time.toIso8601String(),
      'error': instance.error,
      'newData': instance.newData,
    };
