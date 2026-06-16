import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:lectio_wrapper/types/message/message.dart';

import 'message_bloc.dart';

part 'reply_message_bloc.freezed.dart';

@freezed
class ReplyState with _$ReplyState {
  const ReplyState._();
  const factory ReplyState({required String topic, required String content}) =
      _ReplyState;

  bool isValid() {
    return topic.isNotEmpty && content.isNotEmpty;
  }
}

class ReplyMessageBloc extends Cubit<ReplyState> {
  final Message message;
  ReplyMessageBloc(this.message)
      : super(ReplyState(
          content: "",
          topic: message.thread[0].topic,
        ));

  void setTopic(String topic) {
    emit(state.copyWith(topic: topic));
  }

  void setContent(String content) {
    emit(state.copyWith(content: content));
  }

  void submit(BuildContext context) {
    var bloc = context.read<MessageBloc>();
    bloc.add(ReplyMessage(Reply(state.topic, message, state.content)));
  }
}
