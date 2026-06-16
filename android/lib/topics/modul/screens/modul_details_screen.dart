import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/events/calendar_event_details.dart' as ce;
import 'package:lectio_wrapper/types/weeks/calendar_event.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/modul/bloc/event_details_bloc.dart';
import 'package:betterlectio/topics/modul/widgets/information_details.dart';
import 'package:betterlectio/topics/modul/widgets/module_homework_display.dart';
import 'package:betterlectio/topics/modul/widgets/participant_list.dart';
import 'package:betterlectio/topics/modul/widgets/test_participants.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/tabbar.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

bool ine(String input) {
  return input.isNotEmpty;
}

class ModulDetailsScreen extends StatefulWidget {
  const ModulDetailsScreen(
      {super.key, required this.event, this.homework = false});

  final CalendarEvent event;
  final bool homework;

  @override
  State<ModulDetailsScreen> createState() => _ModulDetailsScreenState();
}

class _ModulDetailsScreenState extends State<ModulDetailsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _controller;
  Widget? participantsWidget;
  List<String> tabs = ["Information"];
  @override
  void initState() {
    super.initState();
    int length = 2;
    if (widget.event.type == CalendarEventType.private) {
      length--;
    } else {
      tabs.add(
          widget.event.type == CalendarEventType.regular ? "Lektier" : "Tider");
    }
    if (widget.event.teamObjs.isNotEmpty ||
        widget.event.teacherObjs.isNotEmpty) {
      length++;
      participantsWidget = getMembers(context);
      tabs.add("Deltagere");
    }
    _controller = TabController(
        length: length, vsync: this, initialIndex: widget.homework ? 1 : 0);
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<EventDetailsBloc, EventDetailsState>(
        bloc: EventDetailsBloc(
            getStudentBloc(context).state.student!, widget.event),
        builder: (context, state) {
          return Scaffold(
              appBar: BlAppbar(
                bottom: _controller.length == 1
                    ? null
                    : BlTabBar(
                        controller: _controller,
                        tabs: tabs,
                      ),
                hideMenu: true,
                title: "",
                titleWidget: widget.event.team.isNotEmpty
                    ? TeamName(teamName: widget.event.team)
                    : Text(widget.event.title),
                actions: widget.event.type == CalendarEventType.private
                    ? []
                    : [Container()],
              ),
              body: state.details != null
                  ? TabBarView(
                      controller: _controller,
                      children: [
                        InformationDetails(
                            teachers: state.teachers,
                            event: widget.event,
                            state: state.details!),
                        getSpecificScreen(context, state.details!),
                        participantsWidget
                      ].whereType<Widget>().toList())
                  : const LoadingScreen());
        });
  }

  Widget? getSpecificScreen(
      BuildContext context, ce.CalendarEventDetails details) {
    switch (widget.event.type) {
      case CalendarEventType.test:
        return TestParticipantsList(
            details: details as ce.TestCalendarEventDetails);
      case CalendarEventType.regular:
        return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8.0),
            child: ModuleHomeworkDisplay(
                details: details as ce.RegularCalendarEventDetails));
      case CalendarEventType.private:
        return null;
    }
  }

  Widget? getMembers(BuildContext context) {
    if (widget.event.teamObjs.isNotEmpty ||
        widget.event.teacherObjs.isNotEmpty) {
      return ParticipantList(
          teachers: widget.event.teacherObjs, teams: widget.event.teamObjs);
    }
    return null;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
