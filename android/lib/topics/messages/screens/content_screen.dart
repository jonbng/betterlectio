import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/messages/bloc/new_message_bloc.dart';
import 'package:betterlectio/topics/messages/screens/confirm_action.dart';
import 'package:betterlectio/topics/messages/widgets/message_editor.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';

class MessageContentScreen extends StatelessWidget {
  const MessageContentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: const BlAppbar(title: "Indhold"),
        body: BlocBuilder<NewMessageBloc, NewMessageState>(
          builder: (context, state) {
            var bloc = context.read<NewMessageBloc>();

            return ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(24.0),
              children: [
                const Padding(
                  padding: EdgeInsets.only(bottom: 12.0),
                  child: Illustration(illustration: "text_field"),
                ),
                TextField(
                  onChanged: (value) {
                    bloc.add(UpdateTopic(value));
                  },
                  decoration: InputDecoration(
                      label: const Text("Emne"),
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8.0))),
                ),
                MessageEditor(
                  value: state.content,
                  onChange: (value) {
                    bloc.add(UpdateContent(value));
                  },
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24.0),
                  child: FilledButton.icon(
                    onPressed: state.valid
                        ? () {
                            adSheet(
                                ConfirmAction(
                                  confirmText: "Vil du sende?",
                                  onConfirm: () {
                                    context
                                        .read<NewMessageBloc>()
                                        .add(Send(context));
                                    for (int i = 0; i < 3; i++) {
                                      if (Navigator.canPop(context)) {
                                        Navigator.pop(context);
                                      }
                                    }
                                  },
                                  children: [
                                    ListTile(
                                      title: Text(state.topic),
                                      subtitle: const Text("Emne"),
                                    ),
                                    ListTile(
                                      title: Text(state.content),
                                      subtitle: const Text("Indhold"),
                                    ),
                                    ListTile(
                                      title: Text(state.receivers
                                          .map((e) => e.name)
                                          .join(', ')),
                                      subtitle: const Text("Modtagere"),
                                    )
                                  ],
                                ),
                                context);
                          }
                        : null,
                    label: const Text("Send"),
                    icon: const Icon(EvaIcons.paperPlaneOutline),
                  ),
                )
              ],
            );
          },
        ));
  }
}
