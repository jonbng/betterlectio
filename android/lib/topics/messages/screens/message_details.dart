import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio/basic_info.dart';
import 'package:lectio_wrapper/types/message/message.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/topics/messages/bloc/message_bloc.dart';
import 'package:betterlectio/topics/messages/screens/confirm_action.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/utils/state_pattern.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import '../../state/empty.dart';
import '../../state/loading.dart';
import '../widgets/thread_list.dart';

class MessageDetails extends StatelessWidget {
  const MessageDetails({super.key, required this.ref});

  final MessageRef ref;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BlAppbar(
        title: ref.topic,
        actions: [
          BlocBuilder<StudentCubit<BasicInfo>, StatePattern<BasicInfo?>>(
              builder: (context, state) {
            if (state.state == null) {
              return Container();
            }
            if (state.state!.name ==
                ref.sender.substring(0, ref.sender.indexOf('(')).trim()) {
              return IconButton(
                  onPressed: () {
                    adSheet(
                        ConfirmAction(
                            confirmText: "Vil du slette?",
                            onConfirm: () {
                              BlocProvider.of<MessageBloc>(context)
                                  .add(DeleteMessage(ref));
                              Navigator.pop(context);
                              Navigator.pop(context);
                            }),
                        context);
                  },
                  icon: const Icon(EvaIcons.trash2Outline));
            }
            return Container();
          })
        ],
      ),
      body: BlocBuilder<MessageBloc, MessagesState>(
        builder: (context, state) {
          if (state.loading) {
            return const LoadingScreen();
          }
          var msgIndex =
              state.messages.indexWhere((element) => element.id == ref.id);
          if (msgIndex == -1) {
            return const EmptyScreen();
          }
          var msg = state.messages.elementAt(msgIndex);
          return Scaffold(
            body: RefreshIndicator(
              onRefresh: () async {
                context.read<MessageBloc>().add(LoadMessage(ref));
              },
              child: ThreadList(
                msg: msg,
              ),
            ),
          );
        },
      ),
    );
  }
}
