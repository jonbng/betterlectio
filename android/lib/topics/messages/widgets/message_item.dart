import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:lectio_wrapper/types/message/message.dart';
import 'package:betterlectio/topics/messages/bloc/message_bloc.dart';
import 'package:betterlectio/topics/messages/bloc/new_message_bloc.dart';
import 'package:betterlectio/topics/messages/screens/message_details.dart';
import 'package:betterlectio/utils/ad_route.dart';

class MessageItem extends StatelessWidget {
  const MessageItem({super.key, required this.ref});
  final MessageRef ref;
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<NewMessageBloc, NewMessageState>(
      builder: (context, state) {
        return MessageItemDisplay(state: state, ref: ref);
      },
    );
  }
}

class MessageItemDisplay extends StatelessWidget {
  const MessageItemDisplay({super.key, required this.state, required this.ref});

  final NewMessageState state;
  final MessageRef ref;
  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () {
        context.read<MessageBloc>().add(LoadMessage(ref));

        Navigator.push(context, adRoute(MessageDetails(ref: ref)));
      },
      title: Text(ref.topic),
      subtitle: Text(ref.sender),
      trailing: Text(DateFormat("dd/MM").format(ref.dateChanged)),
    );
  }
}
