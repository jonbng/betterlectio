import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/weeks/calendar_event.dart';
import 'package:betterlectio/topics/calendar/widgets/day_view.dart';

int minutesDifference(DayTime time1, DayTime time2) {
  int diff = 0;
  diff += (time2.hour - time1.hour) * 60;

  diff += time2.minute - time1.minute;

  return diff;
}

DayTime addMinutes(DayTime time1, int minutes) {
  var totalMins =
      minutesDifference(DayTime(hour: 0, minute: 0), time1) + minutes;
  var hours = (totalMins / 60).floor();
  var mins = totalMins % 60;
  return DayTime(hour: hours, minute: mins);
}

class ModulRangeBox extends StatelessWidget {
  const ModulRangeBox({super.key, required this.modulRange});
  final ModulRange modulRange;
  @override
  Widget build(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(right: 4.0),
      child: Container(
        height: ((minutesDifference(modulRange.start, modulRange.end) / 60) *
                hourRowHeight)
            .floorToDouble(),
        decoration: BoxDecoration(
            color: colorScheme.primary,
            borderRadius:
                const BorderRadius.horizontal(right: Radius.circular(6.0))),
        child: Center(
            child: Text(
          "${modulRange.number}",
          style: TextStyle(
              color: colorScheme.onPrimary,
              fontSize: 18.0,
              fontWeight: FontWeight.bold),
        )),
      ),
    );
  }
}
