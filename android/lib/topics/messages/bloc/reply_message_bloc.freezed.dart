// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'reply_message_bloc.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

/// @nodoc
mixin _$ReplyState {
  String get topic => throw _privateConstructorUsedError;
  String get content => throw _privateConstructorUsedError;

  @JsonKey(ignore: true)
  $ReplyStateCopyWith<ReplyState> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ReplyStateCopyWith<$Res> {
  factory $ReplyStateCopyWith(
          ReplyState value, $Res Function(ReplyState) then) =
      _$ReplyStateCopyWithImpl<$Res, ReplyState>;
  @useResult
  $Res call({String topic, String content});
}

/// @nodoc
class _$ReplyStateCopyWithImpl<$Res, $Val extends ReplyState>
    implements $ReplyStateCopyWith<$Res> {
  _$ReplyStateCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? topic = null,
    Object? content = null,
  }) {
    return _then(_value.copyWith(
      topic: null == topic
          ? _value.topic
          : topic // ignore: cast_nullable_to_non_nullable
              as String,
      content: null == content
          ? _value.content
          : content // ignore: cast_nullable_to_non_nullable
              as String,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ReplyStateImplCopyWith<$Res>
    implements $ReplyStateCopyWith<$Res> {
  factory _$$ReplyStateImplCopyWith(
          _$ReplyStateImpl value, $Res Function(_$ReplyStateImpl) then) =
      __$$ReplyStateImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String topic, String content});
}

/// @nodoc
class __$$ReplyStateImplCopyWithImpl<$Res>
    extends _$ReplyStateCopyWithImpl<$Res, _$ReplyStateImpl>
    implements _$$ReplyStateImplCopyWith<$Res> {
  __$$ReplyStateImplCopyWithImpl(
      _$ReplyStateImpl _value, $Res Function(_$ReplyStateImpl) _then)
      : super(_value, _then);

  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? topic = null,
    Object? content = null,
  }) {
    return _then(_$ReplyStateImpl(
      topic: null == topic
          ? _value.topic
          : topic // ignore: cast_nullable_to_non_nullable
              as String,
      content: null == content
          ? _value.content
          : content // ignore: cast_nullable_to_non_nullable
              as String,
    ));
  }
}

/// @nodoc

class _$ReplyStateImpl extends _ReplyState {
  const _$ReplyStateImpl({required this.topic, required this.content})
      : super._();

  @override
  final String topic;
  @override
  final String content;

  @override
  String toString() {
    return 'ReplyState(topic: $topic, content: $content)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ReplyStateImpl &&
            (identical(other.topic, topic) || other.topic == topic) &&
            (identical(other.content, content) || other.content == content));
  }

  @override
  int get hashCode => Object.hash(runtimeType, topic, content);

  @JsonKey(ignore: true)
  @override
  @pragma('vm:prefer-inline')
  _$$ReplyStateImplCopyWith<_$ReplyStateImpl> get copyWith =>
      __$$ReplyStateImplCopyWithImpl<_$ReplyStateImpl>(this, _$identity);
}

abstract class _ReplyState extends ReplyState {
  const factory _ReplyState(
      {required final String topic,
      required final String content}) = _$ReplyStateImpl;
  const _ReplyState._() : super._();

  @override
  String get topic;
  @override
  String get content;
  @override
  @JsonKey(ignore: true)
  _$$ReplyStateImplCopyWith<_$ReplyStateImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
