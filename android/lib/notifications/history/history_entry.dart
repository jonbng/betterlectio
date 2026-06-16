import 'package:freezed_annotation/freezed_annotation.dart';

part 'history_entry.freezed.dart';
part 'history_entry.g.dart';

@freezed
class HistoryEntry with _$HistoryEntry {
  factory HistoryEntry(
      {required DateTime time,
      required bool error,
      required bool newData}) = _HistoryEntry;

  factory HistoryEntry.fromJson(Map<String, dynamic> json) =>
      _$HistoryEntryFromJson(json);
}
