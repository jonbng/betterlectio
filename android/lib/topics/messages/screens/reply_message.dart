import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/message/message.dart';
import 'package:betterlectio/topics/messages/bloc/reply_message_bloc.dart';
import 'package:betterlectio/topics/messages/widgets/message_editor.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';

class ReplyMessageScreen extends StatefulWidget {
  const ReplyMessageScreen({super.key, required this.message});
  final Message message;

  @override
  State<ReplyMessageScreen> createState() => _ReplyMessageScreenState();
}

class _ReplyMessageScreenState extends State<ReplyMessageScreen> {
  late ReplyMessageBloc bloc;
  late TextEditingController topic;
  late TextEditingController content;

  @override
  void initState() {
    super.initState();
    bloc = ReplyMessageBloc(widget.message);
    topic = TextEditingController(text: bloc.state.topic);
    content = TextEditingController(text: bloc.state.content);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BlAppbar(title: "Svar besked"),
      body: BlocBuilder<ReplyMessageBloc, ReplyState>(
        bloc: bloc,
        builder: (context, state) {
          return ListView(
            padding: const EdgeInsets.all(24.0),
            children: [
              const Illustration(illustration: "writer"),
              TextField(
                controller: topic,
                decoration: InputDecoration(
                    label: const Text("Emne"),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8.0))),
                onChanged: bloc.setTopic,
              ),
              MessageEditor(value: state.content, onChange: bloc.setContent),
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: FilledButton(
                    onPressed: state.isValid()
                        ? () {
                            Navigator.pop(context);
                            bloc.submit(context);
                          }
                        : null,
                    child: const Text("Svar")),
              )
            ],
          );
        },
      ),
    );
  }

  @override
  void dispose() {
    topic.dispose();
    content.dispose();
    bloc.close();
    super.dispose();
  }
}
