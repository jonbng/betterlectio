// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'history_entry.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

HistoryEntry _$HistoryEntryFromJson(Map<String, dynamic> json) {
  return _HistoryEntry.fromJson(json);
}

/// @nodoc
mixin _$HistoryEntry {
  DateTime get time => throw _privateConstructorUsedError;
  bool get error => throw _privateConstructorUsedError;
  bool get newData => throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $HistoryEntryCopyWith<HistoryEntry> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $HistoryEntryCopyWith<$Res> {
  factory $HistoryEntryCopyWith(
          HistoryEntry value, $Res Function(HistoryEntry) then) =
      _$HistoryEntryCopyWithImpl<$Res, HistoryEntry>;
  @useResult
  $Res call({DateTime time, bool error, bool newData});
}

/// @nodoc
class _$HistoryEntryCopyWithImpl<$Res, $Val extends HistoryEntry>
    implements $HistoryEntryCopyWith<$Res> {
  _$HistoryEntryCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? time = null,
    Object? error = null,
    Object? newData = null,
  }) {
    return _then(_value.copyWith(
      time: null == time
          ? _value.time
          : time // ignore: cast_nullable_to_non_nullable
              as DateTime,
      error: null == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as bool,
      newData: null == newData
          ? _value.newData
          : newData // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$HistoryEntryImplCopyWith<$Res>
    implements $HistoryEntryCopyWith<$Res> {
  factory _$$HistoryEntryImplCopyWith(
          _$HistoryEntryImpl value, $Res Function(_$HistoryEntryImpl) then) =
      __$$HistoryEntryImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({DateTime time, bool error, bool newData});
}

/// @nodoc
class __$$HistoryEntryImplCopyWithImpl<$Res>
    extends _$HistoryEntryCopyWithImpl<$Res, _$HistoryEntryImpl>
    implements _$$HistoryEntryImplCopyWith<$Res> {
  __$$HistoryEntryImplCopyWithImpl(
      _$HistoryEntryImpl _value, $Res Function(_$HistoryEntryImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? time = null,
    Object? error = null,
    Object? newData = null,
  }) {
    return _then(_$HistoryEntryImpl(
      time: null == time
          ? _value.time
          : time // ignore: cast_nullable_to_non_nullable
              as DateTime,
      error: null == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as bool,
      newData: null == newData
          ? _value.newData
          : newData // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$HistoryEntryImpl implements _HistoryEntry {
  _$HistoryEntryImpl(
      {required this.time, required this.error, required this.newData});

  factory _$HistoryEntryImpl.fromJson(Map<String, dynamic> json) =>
      _$$HistoryEntryImplFromJson(json);

  @override
  final DateTime time;
  @override
  final bool error;
  @override
  final bool newData;

  @override
  String toString() {
    return 'HistoryEntry(time: $time, error: $error, newData: $newData)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$HistoryEntryImpl &&
            (identical(other.time, time) || other.time == time) &&
            (identical(other.error, error) || other.error == error) &&
            (identical(other.newData, newData) || other.newData == newData));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, time, error, newData);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$HistoryEntryImplCopyWith<_$HistoryEntryImpl> get copyWith =>
      __$$HistoryEntryImplCopyWithImpl<_$HistoryEntryImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$HistoryEntryImplToJson(
      this,
    );
  }
}

abstract class _HistoryEntry implements HistoryEntry {
  factory _HistoryEntry(
      {required final DateTime time,
      required final bool error,
      required final bool newData}) = _$HistoryEntryImpl;

  factory _HistoryEntry.fromJson(Map<String, dynamic> json) =
      _$HistoryEntryImpl.fromJson;

  @override
  DateTime get time;
  @override
  bool get error;
  @override
  bool get newData;
  @override
  @JsonKey(ignore: true)
  _$$HistoryEntryImplCopyWith<_$HistoryEntryImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
