import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/message/message.dart';
import 'package:betterlectio/topics/messages/widgets/thread_entry_widget.dart';

class ThreadList extends StatelessWidget {
  const ThreadList({
    super.key,
    required this.msg,
  });

  final Message msg;
  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 8.0),
      itemCount: msg.thread.length,
      itemBuilder: (context, index) {
        var threadItem = msg.thread[index];
        return ThreadEntryWidget(
          entry: threadItem,
        );
      },
    );
  }
}
