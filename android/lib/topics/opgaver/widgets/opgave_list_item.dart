import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:lectio_wrapper/types/assignment.dart';
import 'package:betterlectio/topics/opgaver/bloc/opgaver_details_bloc.dart';
import 'package:betterlectio/topics/opgaver/screens/opgave_screen.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/utils/helpers.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

class OpgaveListItem extends StatefulWidget {
  final AssignmentRef opgave;

  const OpgaveListItem({super.key, required this.opgave});

  @override
  State<OpgaveListItem> createState() => _OpgaveListItemState();
}

enum LateLevel { okay, close, dayum }

class _OpgaveListItemState extends State<OpgaveListItem> {
  (String, LateLevel) futureOrLate(DateTime time) {
    var now = DateTime.now();
    var days = now.difference(time).inDays.abs();
    var hours = now.difference(time).inHours.abs();
    var minutes =
        now.add(Duration(hours: hours)).difference(time).inMinutes.abs();
    var text = time.isAfter(now) ? "tilbage" : "forsinket";
    if (days == 1) {
      return ("$days dag $text", LateLevel.close);
    }
    if (days > 1) {
      return ("$days dage $text", LateLevel.okay);
    }
    return (
      "${hours > 0 ? hours == 1 ? "$hours time og " : "$hours timer og " : ""}${minutes == 1 ? "$minutes minut" : "$minutes minutter"} $text",
      LateLevel.dayum
    );
  }

  late bool delivered;
  late String timeText;
  late bool missing;
  late LateLevel lateLevel;
  void _buildState() {
    delivered = widget.opgave.status == "Afleveret";
    (String, LateLevel) textAndLevel = futureOrLate(widget.opgave.deadline);
    timeText = delivered
        ? "${formatDateReadable(widget.opgave.deadline)} ${DateFormat.Hm().format(widget.opgave.deadline)}"
        : textAndLevel.$1;
    missing = widget.opgave.status == "Mangler";
    lateLevel = textAndLevel.$2;
  }

  @override
  void initState() {
    super.initState();
    _buildState();
  }

  @override
  void didUpdateWidget(covariant OpgaveListItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    _buildState();
  }

  Color iconColor(LateLevel level) {
    switch (level) {
      case LateLevel.okay:
        return Theme.of(context).colorScheme.primary;
      case LateLevel.dayum:
        return Colors.deepOrange;
      case LateLevel.close:
        return Colors.orange.shade700;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () {
        context.read<OpgaveDetailsBloc>().load(widget.opgave);
        Navigator.push(
            context,
            adRoute(OpgaveScreen(
              ref: widget.opgave,
            )));
      },
      leading: Icon(
        delivered
            ? EvaIcons.checkmark
            : (missing ? EvaIcons.close : EvaIcons.clockOutline),
        color: delivered
            ? Colors.green
            : missing
                ? Colors.red
                : iconColor(lateLevel),
      ),
      title: TeamName(
        teamName: widget.opgave.team,
        builder: (name) {
          return Text("${widget.opgave.title} - $name");
        },
      ),
      subtitle: Text("${widget.opgave.status} - $timeText"),
    );
  }
}
