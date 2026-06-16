import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/message/message.dart';
import 'package:lectio_wrapper/types/message/meta/meta.dart';

import 'message_bloc.dart';

sealed class NewMessageEvent {}

final class Load extends NewMessageEvent {}

final class AddPerson extends NewMessageEvent {
  final MetaDataEntry person;
  AddPerson(this.person);
}

final class RemovePerson extends NewMessageEvent {
  final MetaDataEntry person;
  RemovePerson(this.person);
}

final class UpdateTopic extends NewMessageEvent {
  String topic;
  UpdateTopic(this.topic);
}

final class UpdateContent extends NewMessageEvent {
  String content;
  UpdateContent(this.content);
}

final class Send extends NewMessageEvent {
  BuildContext context;
  Send(this.context);
}

class NewMessageBloc extends Bloc<NewMessageEvent, NewMessageState> {
  final Student student;
  NewMessageBloc(this.student)
      : super(NewMessageState(true, null, [], "", "")) {
    on<Load>(
      (event, emit) async {
        emit(state.copyWith(loading: false, data: await student.meta.get()));
      },
    );
    on<AddPerson>(
      (event, emit) {
        emit(state.copyWith(receivers: state.receivers..add(event.person)));
      },
    );
    on<RemovePerson>(
      (event, emit) {
        emit(state.copyWith(receivers: state.receivers..remove(event.person)));
      },
    );

    on<UpdateContent>(
      (event, emit) {
        emit(state.copyWith(content: event.content));
      },
    );

    on<UpdateTopic>(
      (event, emit) {
        emit(state.copyWith(topic: event.topic));
      },
    );

    on<Send>(
      (event, emit) {
        event.context.read<MessageBloc>().add(NewMessage(
            CreateMessage(state.topic, state.content, state.receivers)));

        emit(state.copyWith(receivers: [], topic: "", content: ""));
      },
    );
  }
}

class NewMessageState {
  bool loading;
  MessageMetaData? data;
  List<MetaDataEntry> receivers;
  String topic;
  String content;
  bool valid;
  NewMessageState(
      this.loading, this.data, this.receivers, this.topic, this.content)
      : valid = topic.isNotEmpty && content.isNotEmpty && receivers.isNotEmpty;
  NewMessageState copyWith(
      {bool? loading,
      MessageMetaData? data,
      List<MetaDataEntry>? receivers,
      String? topic,
      String? content}) {
    return NewMessageState(
        loading ?? this.loading,
        data ?? this.data,
        receivers ?? this.receivers,
        topic ?? this.topic,
        content ?? this.content);
  }
}
