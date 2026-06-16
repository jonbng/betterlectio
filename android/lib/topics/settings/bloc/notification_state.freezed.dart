// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'notification_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

NotificationState _$NotificationStateFromJson(Map<String, dynamic> json) {
  return _NotificationState.fromJson(json);
}

/// @nodoc
mixin _$NotificationState {
  bool get hasEventNotifications => throw _privateConstructorUsedError;
  bool get hasNewMessageNotifications => throw _privateConstructorUsedError;
  bool get hasAssignmentStatusNotifications =>
      throw _privateConstructorUsedError;

  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;
  @JsonKey(ignore: true)
  $NotificationStateCopyWith<NotificationState> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $NotificationStateCopyWith<$Res> {
  factory $NotificationStateCopyWith(
          NotificationState value, $Res Function(NotificationState) then) =
      _$NotificationStateCopyWithImpl<$Res, NotificationState>;
  @useResult
  $Res call(
      {bool hasEventNotifications,
      bool hasNewMessageNotifications,
      bool hasAssignmentStatusNotifications});
}

/// @nodoc
class _$NotificationStateCopyWithImpl<$Res, $Val extends NotificationState>
    implements $NotificationStateCopyWith<$Res> {
  _$NotificationStateCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? hasEventNotifications = null,
    Object? hasNewMessageNotifications = null,
    Object? hasAssignmentStatusNotifications = null,
  }) {
    return _then(_value.copyWith(
      hasEventNotifications: null == hasEventNotifications
          ? _value.hasEventNotifications
          : hasEventNotifications // ignore: cast_nullable_to_non_nullable
              as bool,
      hasNewMessageNotifications: null == hasNewMessageNotifications
          ? _value.hasNewMessageNotifications
          : hasNewMessageNotifications // ignore: cast_nullable_to_non_nullable
              as bool,
      hasAssignmentStatusNotifications: null == hasAssignmentStatusNotifications
          ? _value.hasAssignmentStatusNotifications
          : hasAssignmentStatusNotifications // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$NotificationStateImplCopyWith<$Res>
    implements $NotificationStateCopyWith<$Res> {
  factory _$$NotificationStateImplCopyWith(_$NotificationStateImpl value,
          $Res Function(_$NotificationStateImpl) then) =
      __$$NotificationStateImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {bool hasEventNotifications,
      bool hasNewMessageNotifications,
      bool hasAssignmentStatusNotifications});
}

/// @nodoc
class __$$NotificationStateImplCopyWithImpl<$Res>
    extends _$NotificationStateCopyWithImpl<$Res, _$NotificationStateImpl>
    implements _$$NotificationStateImplCopyWith<$Res> {
  __$$NotificationStateImplCopyWithImpl(_$NotificationStateImpl _value,
      $Res Function(_$NotificationStateImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? hasEventNotifications = null,
    Object? hasNewMessageNotifications = null,
    Object? hasAssignmentStatusNotifications = null,
  }) {
    return _then(_$NotificationStateImpl(
      hasEventNotifications: null == hasEventNotifications
          ? _value.hasEventNotifications
          : hasEventNotifications // ignore: cast_nullable_to_non_nullable
              as bool,
      hasNewMessageNotifications: null == hasNewMessageNotifications
          ? _value.hasNewMessageNotifications
          : hasNewMessageNotifications // ignore: cast_nullable_to_non_nullable
              as bool,
      hasAssignmentStatusNotifications: null == hasAssignmentStatusNotifications
          ? _value.hasAssignmentStatusNotifications
          : hasAssignmentStatusNotifications // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$NotificationStateImpl implements _NotificationState {
  _$NotificationStateImpl(
      {required this.hasEventNotifications,
      required this.hasNewMessageNotifications,
      required this.hasAssignmentStatusNotifications});

  factory _$NotificationStateImpl.fromJson(Map<String, dynamic> json) =>
      _$$NotificationStateImplFromJson(json);

  @override
  final bool hasEventNotifications;
  @override
  final bool hasNewMessageNotifications;
  @override
  final bool hasAssignmentStatusNotifications;

  @override
  String toString() {
    return 'NotificationState(hasEventNotifications: $hasEventNotifications, hasNewMessageNotifications: $hasNewMessageNotifications, hasAssignmentStatusNotifications: $hasAssignmentStatusNotifications)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$NotificationStateImpl &&
            (identical(other.hasEventNotifications, hasEventNotifications) ||
                other.hasEventNotifications == hasEventNotifications) &&
            (identical(other.hasNewMessageNotifications,
                    hasNewMessageNotifications) ||
                other.hasNewMessageNotifications ==
                    hasNewMessageNotifications) &&
            (identical(other.hasAssignmentStatusNotifications,
                    hasAssignmentStatusNotifications) ||
                other.hasAssignmentStatusNotifications ==
                    hasAssignmentStatusNotifications));
  }

  @JsonKey(ignore: true)
  @override
  int get hashCode => Object.hash(runtimeType, hasEventNotifications,
      hasNewMessageNotifications, hasAssignmentStatusNotifications);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$NotificationStateImplCopyWith<_$NotificationStateImpl> get copyWith =>
      __$$NotificationStateImplCopyWithImpl<_$NotificationStateImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$NotificationStateImplToJson(
      this,
    );
  }
}

abstract class _NotificationState implements NotificationState {
  factory _NotificationState(
          {required final bool hasEventNotifications,
          required final bool hasNewMessageNotifications,
          required final bool hasAssignmentStatusNotifications}) =
      _$NotificationStateImpl;

  factory _NotificationState.fromJson(Map<String, dynamic> json) =
      _$NotificationStateImpl.fromJson;

  @override
  bool get hasEventNotifications;
  @override
  bool get hasNewMessageNotifications;
  @override
  bool get hasAssignmentStatusNotifications;
  @override
  @JsonKey(ignore: true)
  _$$NotificationStateImplCopyWith<_$NotificationStateImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
