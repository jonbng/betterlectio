import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_week_view/flutter_week_view.dart' as wv;
import 'package:lectio_wrapper/types/weeks/calendar_event.dart';
import 'package:lectio_wrapper/utils/dating.dart';
import 'package:betterlectio/topics/calendar/widgets/day_event.dart';
import 'package:betterlectio/topics/state/empty.dart';
import '../bloc/schema_bloc.dart';
import '../../state/loading.dart';

const double columnWidth = 55.0;
const double hourRowHeight = 65.0;

CalendarEvent? maxOrMin(List<CalendarEvent> events,
    bool Function(CalendarEvent a, CalendarEvent b) compare) {
  if (events.isEmpty) {
    return null;
  }
  var current = events.elementAt(0);
  for (var event in events) {
    if (compare(event, current)) {
      current = event;
    }
  }
  return current;
}

class DayView extends StatelessWidget {
  final DateTime daySelected;
  final SchemaBloc? bloc;
  const DayView({super.key, required this.daySelected, this.bloc});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SchemaBloc, SchemaState>(
      bloc: bloc,
      builder: (context, state) {
        return RefreshIndicator(
            onRefresh: () async {
              var schemaBloc = bloc ?? context.read<SchemaBloc>();
              var selectedTime = schemaBloc.state.selectedTime;
              schemaBloc.add(RefreshWeekEvent(selectedTime));
            },
            child: DayViewDisplay(
              dateSelected: daySelected,
              weeks: state.weeks,
            ));
      },
    );
  }
}

class DayViewDisplay extends StatefulWidget {
  const DayViewDisplay({
    super.key,
    required this.dateSelected,
    required this.weeks,
  });

  final DateTime dateSelected;
  final Map<int, List<Week>> weeks;

  @override
  State<DayViewDisplay> createState() => _DayViewDisplayState();
}

class _DayViewDisplayState extends State<DayViewDisplay> {
  bool isEmpty = true;
  bool loading = true;
  late wv.HourMinute minimumTime;
  late wv.HourMinute maximumTime;
  late Day day;
  late List<wv.FlutterWeekViewEvent> events;

  void _buildState() async {
    DateTime? firstEventStart;
    DateTime? lastEventEnd;
    DateTime dateSelected = widget.dateSelected;
    var weekNum = weekFromDateTime(dateSelected);
    var availableWeeks = widget.weeks[dateSelected.year]
        ?.where((element) => element.weekNum == weekNum)
        .toList();
    if (availableWeeks == null || availableWeeks.isEmpty) {
      loading = true;
    } else {
      var availableDays = availableWeeks[0]
          .days
          .where((element) => element.date.day == dateSelected.day)
          .toList();
      if (availableDays.isEmpty) {
        day = Day(informations: [], events: [], date: dateSelected);
      } else {
        day = availableDays[0];
      }
      if (day.events.isEmpty) {
        isEmpty = true;
      } else {
        isEmpty = false;
        events = day.events.map((dayEvent) {
          return buildDayEvent(context, dayEvent);
        }).toList();
      }

      firstEventStart =
          maxOrMin(day.events, (a, b) => a.start.isBefore(b.start))?.start;
      lastEventEnd = maxOrMin(day.events, (a, b) => a.end.isAfter(b.end))?.end;
      loading = false;
    }
    minimumTime = firstEventStart != null && firstEventStart.hour < 8
        ? wv.HourMinute(
            hour: firstEventStart.hour - 1, minute: firstEventStart.minute)
        : const wv.HourMinute(hour: 7, minute: 30);
    maximumTime = lastEventEnd != null
        ? wv.HourMinute(hour: lastEventEnd.hour + 1, minute: 30)
        : wv.HourMinute.max;
  }

  @override
  void initState() {
    super.initState();
    _buildState();
  }

  @override
  void didUpdateWidget(covariant DayViewDisplay oldWidget) {
    super.didUpdateWidget(oldWidget);
    _buildState();
  }

  @override
  Widget build(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    if (loading) {
      return const LoadingScreen();
    }
    if (isEmpty) {
      return const CustomScrollView(slivers: <Widget>[
        SliverFillRemaining(
            child: EmptyScreen(
          noEvents: true,
          text: "Der sker ingenting i dag",
        ))
      ]);
    }
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: wv.DayView(
        inScrollableWidget: false,
        style: wv.DayViewStyle(
          hourRowHeight: hourRowHeight,
          backgroundRulesColor: colorScheme.outline,
          backgroundColor: colorScheme.surface,
          headerSize: 0.0,
        ),
        userZoomable: false,
        date: widget.dateSelected,
        hoursColumnStyle: wv.HoursColumnStyle(
            textStyle: TextStyle(color: colorScheme.onSurface),
            color: colorScheme.surface,
            width: columnWidth,
            timeFormatter: (time) {
              return "${time.hour}:${time.minute > 9 ? time.minute : "${time.minute}0"}";
            },
            interval: const Duration(minutes: 60)),
        minimumTime: minimumTime,
        maximumTime: maximumTime,
        events: events,
      ),
    );
  }
}
