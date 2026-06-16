import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/message/message.dart';

part 'message_bloc.freezed.dart';

sealed class MessageEvent {}

class LoadRefs extends MessageEvent {}

class LoadMessage extends MessageEvent {
  MessageRef ref;
  LoadMessage(this.ref);
}

class NewMessage extends MessageEvent {
  CreateMessage newMessage;
  NewMessage(this.newMessage);
}

class DeleteMessage extends MessageEvent {
  MessageRef ref;
  DeleteMessage(this.ref);
}

class ReplyMessage extends MessageEvent {
  Reply reply;
  ReplyMessage(this.reply);
}

class MessageBloc extends Bloc<MessageEvent, MessagesState> {
  final Student student;
  MessageBloc(this.student)
      : super(const MessagesState(refs: [], loading: true, messages: [])) {
    on<LoadRefs>(
      (event, emit) async {
        emit(state.copyWith(loading: true));
        emit(state.copyWith(
            refs: await student.messages.list(), loading: false));
      },
    );
    on<LoadMessage>(
      (event, emit) async {
        if (state.messages
                .indexWhere((element) => element.id == event.ref.id) ==
            -1) {
          emit(state.copyWith(loading: true));
          var loadedMessage = await student.messages.get(event.ref);
          if (loadedMessage != null) {
            emit(state.copyWith(
                messages: [...state.messages, loadedMessage], loading: false));
          }
        } else {
          refreshMessage(
            emit,
            Message(event.ref.id, [], [], event.ref),
          );
        }
      },
    );

    on<NewMessage>(
      (event, emit) async {
        await student.messages.create(event.newMessage);
        add(LoadRefs());
      },
    );
    on<DeleteMessage>(
      (event, emit) async {
        await student.messages.delete(Message(event.ref.id, [], [], event.ref));
        emit(state.copyWith(messages: [
          ...state.messages.where((element) => element.id != event.ref.id)
        ]));
        add(LoadRefs());
      },
    );

    on<ReplyMessage>(
      (event, emit) async {
        emit(state.copyWith(loading: true));
        await student.messages.threads.reply(event.reply);
        await refreshMessage(emit, event.reply.message);
      },
    );
  }

  Future<void> refreshMessage(
      Emitter<MessagesState> emit, Message message) async {
    emit(state.copyWith(
        messages: state.messages
            .where((element) => element.id != message.id)
            .toList()));
    add(LoadMessage(message.ref));
  }
}

@freezed
class MessagesState with _$MessagesState {
  const factory MessagesState(
      {required List<MessageRef> refs,
      required List<Message> messages,
      required bool loading}) = _MessagesState;
}
