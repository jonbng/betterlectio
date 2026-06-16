import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../utils/helpers.dart';

class TimeSelect extends StatelessWidget {
  const TimeSelect(
      {super.key,
      required this.name,
      required this.update,
      required this.time,
      this.errorText});
  final Function(DateTime time) update;
  final DateTime time;
  final String name;
  final String? errorText;
  @override
  Widget build(BuildContext context) {
    return InputDecorator(
        decoration: InputDecoration(
            border: InputBorder.none, label: Text(name), errorText: errorText),
        child: FilledButton.icon(
          onPressed: () {
            showDatePicker(
                    context: context,
                    initialDate: time,
                    firstDate: time.subtract(const Duration(days: 200)),
                    lastDate: time.add(const Duration(days: 200)))
                .then((date) {
              if (date == null || !context.mounted) {
                return;
              }

              showTimePicker(
                      context: context,
                      initialTime: TimeOfDay.fromDateTime(time))
                  .then((timeOfDay) {
                if (timeOfDay != null) {
                  update(date.copyWith(
                      hour: timeOfDay.hour, minute: timeOfDay.minute));
                }
              });
            });
          },
          icon: const Icon(EvaIcons.calendarOutline),
          label: Text(
              "${formatDateReadable(time)} ${DateFormat("HH:mm").format(time)}"),
        ));
  }
}
