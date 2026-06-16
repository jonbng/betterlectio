import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_speed_dial/flutter_speed_dial.dart';
import 'package:lectio_wrapper/utils/dating.dart';
import 'package:betterlectio/topics/calendar/widgets/information_dialog.dart';
import 'package:betterlectio/topics/calendar/widgets/week_header.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';

import '../bloc/schema_bloc.dart';
import '../../../utils/helpers.dart';
import '../widgets/day_view.dart';

class SchemaScreen extends StatefulWidget {
  const SchemaScreen({super.key, this.bloc, this.name, this.room = false});

  final SchemaBloc? bloc;
  final String? name;
  final bool room;

  @override
  State<SchemaScreen> createState() => _SchemaScreenState();
}

const int startIndex = 700;

class _SchemaScreenState extends State<SchemaScreen> {
  late DateTime start =
      (widget.bloc ?? context.read<SchemaBloc>()).state.selectedTime;
  late PageController _pageController;
  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: startIndex);
  }

  Future<void> showPicker() async {
    var bloc = widget.bloc ?? context.read<SchemaBloc>();
    DateTime? maybeDate = await showDatePicker(
        context: context,
        initialDate: bloc.state.selectedTime,
        firstDate: start.subtract(const Duration(days: 365)),
        lastDate: start.add(const Duration(days: 365)));
    if (maybeDate != null) {
      jumpDate(maybeDate);
    }
  }

  void jumpDate(DateTime date, {int? animMillis}) {
    DateTime fixedTime = date.copyWith(hour: 12);
    Duration timeDiff = start.difference(fixedTime);
    double dayDiff = timeDiff.inHours / 24;
    int pageIndex = startIndex - dayDiff.round();
    if (animMillis != null) {
      _pageController.animateToPage(pageIndex,
          duration: Duration(milliseconds: animMillis), curve: Curves.easeIn);
    } else {
      _pageController.jumpToPage(pageIndex);
    }
  }

  @override
  Widget build(BuildContext context) {
    var today = DateTime.now();
    var colorScheme = Theme.of(context).colorScheme;
    return BlocConsumer<SchemaBloc, SchemaState?>(
      listener: (context, state) {
        if (state != null && state.mode == SwitchMode.selector) {
          jumpDate(state.selectedTime);
        }
      },
      bloc: widget.bloc,
      builder: (context, state) {
        int? weekNum =
            state != null ? weekFromDateTime(state.selectedTime) : null;
        var matchingWeek = state!.weeks[state.selectedTime.year]
            ?.indexWhere((week) => week.weekNum == weekNum);
        var matchingDay = matchingWeek != null && matchingWeek != -1
            ? state.weeks[state.selectedTime.year]
                ?.elementAt(matchingWeek)
                .days
                .where((day) => day.date.day == state.selectedTime.day)
                .firstOrNull
            : null;
        return Scaffold(
          appBar: LppAppbar(
            title: "",
            actions: [
              if (matchingDay != null && matchingDay.informations.isNotEmpty)
                IconButton(
                    onPressed: () {
                      showDialog(
                        context: context,
                        builder: (context) {
                          return InformationsDialog(
                            informations: matchingDay.informations,
                          );
                        },
                      );
                    },
                    icon: const Icon(Icons.bookmark_outline))
            ],
            titleWidget: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    mainAxisAlignment: MainAxisAlignment.start,
                    children: [
                      Text(
                        "Uge ${weekFromDateTime(state.selectedTime.copyWith(hour: 0, minute: 0))}",
                        overflow: TextOverflow.ellipsis,
                      ),
                      Expanded(
                        child: Text(
                          " - ${months[state.selectedTime.month - 1]} ${state.selectedTime.year.toString()}",
                          style: const TextStyle(fontWeight: FontWeight.normal),
                          overflow: TextOverflow.ellipsis,
                        ),
                      )
                    ],
                  ),
                ),
                if (widget.name != null)
                  Text(
                    "${widget.room ? "Lokale " : ""}${widget.name} skema",
                    style: Theme.of(context).textTheme.labelMedium!,
                    textAlign: TextAlign.start,
                    overflow: TextOverflow.ellipsis,
                  )
              ],
            ),
            bottom: WeekHeader(
              bloc: widget.bloc,
            ),
          ),
          floatingActionButton: SpeedDial(
            backgroundColor: colorScheme.primary,
            foregroundColor: colorScheme.onPrimary,
            spaceBetweenChildren: 16.0,
            spacing: 0.0,
            childPadding: const EdgeInsets.symmetric(vertical: 0.0),
            activeChild: const Icon(EvaIcons.close),
            icon: EvaIcons.moreVertical,
            activeIcon: EvaIcons.close,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            children: [
              SpeedDialChild(
                  onTap: () {
                    if (!(state.selectedTime.day == today.day &&
                        state.selectedTime.month == today.month &&
                        state.selectedTime.year == today.year)) {
                      (widget.bloc ?? context.read<SchemaBloc>())
                          .add(SwitchedDate(today));
                    }
                  },
                  child: const Icon(Icons.today),
                  label: 'Dags dato'),
              SpeedDialChild(
                  onTap: () async {
                    await showPicker();
                  },
                  child: Semantics(
                      identifier: 'date-picker',
                      child: const Icon(Icons.date_range)),
                  label: 'Vælg dato'),
            ],
            child: Semantics(
                identifier: 'option-dial',
                label: 'Option Dial',
                child: const Icon(EvaIcons.moreVertical)),
          ),
          body: PageView.builder(
              controller: _pageController,
              scrollDirection: Axis.horizontal,
              onPageChanged: (value) {
                (widget.bloc ?? context.read<SchemaBloc>()).add(
                    SliderSwitchedDate(
                        start.add(Duration(days: value - startIndex))));
              },
              itemBuilder: (context, index) {
                return DayView(
                  bloc: widget.bloc,
                  daySelected: start.add(Duration(days: index - startIndex)),
                );
              }),
        );
      },
    );
  }

  @override
  void dispose() {
    super.dispose();
    _pageController.dispose();
  }
}
