import 'package:flutter/material.dart';
import 'package:betterlectio/utils/helpers.dart';

class DayHeaderEntry extends StatelessWidget {
  const DayHeaderEntry(
      {super.key,
      required this.day,
      required this.selected,
      required this.choose});
  final DateTime day;
  final Function() choose;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    var boxDecoration = BoxDecoration(
        color: selected
            ? colorScheme.secondaryContainer
            : colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(6.0));
    var textStyle = TextStyle(
      color: selected ? colorScheme.primary : colorScheme.onSurfaceVariant,
      fontWeight: FontWeight.bold,
    );
    return Padding(
      padding: const EdgeInsets.all(4.0),
      child: Ink(
        decoration: boxDecoration,
        child: InkWell(
          borderRadius: BorderRadius.circular(6.0),
          onTap: choose,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text("${day.day}", style: textStyle.copyWith(fontSize: 18.0)),
              Text(
                weekDays[day.weekday - 1].substring(0, 3),
                style: textStyle,
              )
            ],
          ),
        ),
      ),
    );
  }
}
