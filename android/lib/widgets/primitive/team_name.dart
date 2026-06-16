import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';

const codeWord = "Andet";

class TeamName extends StatelessWidget {
  const TeamName({super.key, required this.teamName, this.builder});
  final String teamName;
  final Widget Function(String name)? builder;
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<StudentBloc, StudentState>(builder: (context, state) {
      var fTeam = state.teams.indexWhere((element) => element.name == teamName);
      String name = teamName;

      if (fTeam != -1) {
        var team = state.teams.elementAt(fTeam);
        if (!(team.displayName == codeWord)) {
          name = team.displayName;
        }
      }
      if (builder != null) {
        return builder!(name);
      }
      return Text(name);
    });
  }
}
