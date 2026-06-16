import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/calendar/bloc/schema_bloc.dart';
import 'package:betterlectio/topics/calendar/widgets/day_header_entry.dart';
import 'package:betterlectio/topics/state/loading.dart';

const itemCount = 100;
const headerHeight = 65.0;

class WeekHeader extends StatefulWidget implements PreferredSizeWidget {
  const WeekHeader({super.key, required this.bloc});
  final SchemaBloc? bloc;
  @override
  State<WeekHeader> createState() => _WeekHeaderState();

  @override
  Size get preferredSize => const Size.fromHeight(headerHeight);
}

class _WeekHeaderState extends State<WeekHeader> {
  late int _startIndex;
  late PageController _controller;
  late DateTime _startTime;
  late DateTime _startMonday;
  late SchemaBloc bloc;
  int _selected = 0;

  @override
  void initState() {
    super.initState();
    bloc = (widget.bloc ?? context.read<SchemaBloc>());
    _startIndex = (itemCount / 2).floor();
    _controller = PageController(initialPage: _startIndex);
    _startTime = bloc.state.selectedTime;
    var diffFromMon = _startTime.weekday - 1;
    _startMonday = _startTime.subtract(Duration(days: diffFromMon));
    _selected = _startIndex;
  }

  void jumpToYearAndWeek(DateTime time) {
    int dayDifference = time.difference(_startMonday).inDays;
    int weekDifference = (dayDifference / 7).floor();
    int pageIndex = (_startIndex + weekDifference);

    if ((pageIndex - _selected).abs() > 1) {
      _controller.jumpToPage(pageIndex);
    } else {
      _controller.animateToPage(pageIndex,
          duration: const Duration(milliseconds: 250), curve: Curves.easeInOut);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: headerHeight,
      child: BlocConsumer<SchemaBloc, SchemaState?>(
          listener: (context, state) {
            if (state != null && state.mode == SwitchMode.slider) {
              jumpToYearAndWeek(state.selectedTime);
            }
          },
          bloc: widget.bloc,
          builder: (context, state) {
            if (state != null) {
              return PageView.builder(
                onPageChanged: (value) {
                  _selected = value;
                },
                controller: _controller,
                itemCount: itemCount,
                itemBuilder: (context, index) {
                  var weekDiff = index - _startIndex;
                  DateTime thisWeeksMonday = _startMonday
                      .copyWith(hour: 12)
                      .add(Duration(days: weekDiff * 7));

                  List<DateTime> days = [
                    for (var i = 0; i < 7; i++)
                      thisWeeksMonday.add(Duration(days: i))
                  ];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4.0),
                    child: GridView(
                        primary: false,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                                mainAxisExtent: headerHeight - 4.0,
                                crossAxisCount: 7),
                        children: days
                            .map((day) => DayHeaderEntry(
                                  choose: () {
                                    (widget.bloc ?? context.read<SchemaBloc>())
                                        .add(SwitchedDate(day));
                                  },
                                  day: day,
                                  selected: day.day == state.selectedTime.day &&
                                      day.month == state.selectedTime.month &&
                                      day.year == state.selectedTime.year,
                                ))
                            .toList()),
                  );
                },
              );
            }
            return const LoadingScreen();
          }),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
