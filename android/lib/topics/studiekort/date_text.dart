import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class BirthdayText extends StatefulWidget {
  const BirthdayText({
    super.key,
    required this.birthday,
  });

  final DateTime birthday;

  @override
  State<BirthdayText> createState() => _BirthdayTextState();
}

class _BirthdayTextState extends State<BirthdayText> {
  late int years;
  final birthdayFormat = DateFormat("dd/MM-yyyy");
  @override
  void initState() {
    super.initState();
    var now = DateTime.now();
    var difference = widget.birthday.difference(now);
    years = (difference.inDays / 365).abs().floor();
  }

  @override
  Widget build(BuildContext context) {
    var theme = Theme.of(context).colorScheme;
    return Text(
      "${birthdayFormat.format(widget.birthday)} ($years år)",
      style: Theme.of(context)
          .textTheme
          .labelMedium!
          .copyWith(color: theme.onSecondary),
    );
  }
}

class TimerWidget extends StatefulWidget {
  const TimerWidget({super.key});

  @override
  State<TimerWidget> createState() => _TimerState();
}

class _TimerState extends State<TimerWidget> {
  late DateTime time;
  late Timer timer;
  @override
  void initState() {
    super.initState();
    updateTime();
    timer = Timer.periodic(const Duration(seconds: 1), (t) => updateTime());
  }

  void updateTime() {
    setState(() {
      time = DateTime.now();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisAlignment: MainAxisAlignment.end, children: [
      Text(
        "${DateFormat("HH:mm:ss").format(time)} - BetterLectio",
        style: Theme.of(context)
            .textTheme
            .labelMedium!
            .copyWith(color: Theme.of(context).colorScheme.onSecondary),
      ),
    ]);
  }

  @override
  void dispose() {
    timer.cancel();
    super.dispose();
  }
}
