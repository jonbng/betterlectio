import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/settings/bloc/notification_bloc.dart';
import 'package:betterlectio/topics/settings/bloc/notification_state.dart';

class NotificationScreen extends StatelessWidget {
  const NotificationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: BlocBuilder<NotificationBloc, NotificationState>(
        builder: (context, state) {
          var bloc = context.read<NotificationBloc>();
          List<(String, bool, VoidCallback)> notificationTypes = [
            (
              "Aflyste og ændrede moduler",
              state.hasEventNotifications,
              () {
                bloc.toggleEventNotifications();
              }
            ),
            (
              "Nye beskeder",
              state.hasNewMessageNotifications,
              () {
                bloc.toggleNewMessageNotifications();
              }
            ),
            (
              "Afsluttede opgaver",
              state.hasAssignmentStatusNotifications,
              () {
                bloc.toggleAssignmentStatusNotifications();
              }
            )
          ];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                  padding: EdgeInsets.only(top: 12.0, left: 16.0),
                  child: Text(
                      "Hvis der ikke automatisk kommer en popup, skal notifikationer tillades manuelt i indstillinger.")),
              ...notificationTypes.map((type) {
                return SwitchListTile(
                  title: Text(type.$1),
                  value: type.$2,
                  onChanged: (_) {
                    type.$3();
                  },
                );
              })
            ],
          );
        },
      ),
    );
  }
}
