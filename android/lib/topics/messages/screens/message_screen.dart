import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/messages/bloc/message_bloc.dart';
import 'package:betterlectio/topics/messages/widgets/message_item.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';

import '../../state/empty.dart';
import '../../state/loading.dart';

class MessageScreen extends StatelessWidget {
  const MessageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BlAppbar(
        title: "Beskeder",
      ),
      body: BlocBuilder<MessageBloc, MessagesState>(
        builder: (context, data) {
          if (data.loading) {
            return const LoadingScreen();
          }
          if (data.refs.isEmpty) {
            return const EmptyScreen();
          }
          return RefreshIndicator(
            onRefresh: () async {
              context.read<MessageBloc>().add(LoadRefs());
            },
            child: ListView.builder(
              itemCount: data.refs.length,
              itemBuilder: (context, index) {
                return MessageItem(ref: data.refs[index]);
              },
            ),
          );
        },
      ),
    );
  }
}
