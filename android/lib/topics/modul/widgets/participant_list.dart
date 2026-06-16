import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio/student.dart';
import 'package:lectio_wrapper/types/message/meta/meta.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/modul/bloc/participant_bloc.dart';
import 'package:betterlectio/topics/people/widget/person_tile.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';

class ParticipantList extends StatelessWidget {
  const ParticipantList(
      {super.key, required this.teachers, required this.teams});
  final List<MetaDataEntry> teachers;
  final List<MetaDataEntry> teams;
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ParticipantBloc, ParticipantsState?>(
      bloc: ParticipantBloc(
          getStudentBloc(context).state.student!, teachers, teams),
      builder: (context, state) {
        if (state == null) {
          return const LoadingScreen();
        }
        if (state.students.isEmpty && state.teachers.isEmpty) {
          return const EmptyScreen();
        }
        return ListView(
          children: [
            if (state.teachers.isNotEmpty)
              PeopleList(name: "Lærere", people: state.teachers),
            if (state.students.isNotEmpty)
              PeopleList(
                  name: "Elever",
                  people: state.students
                      .where((element) => !element.teacher)
                      .toList())
          ],
        );
      },
    );
  }
}

class PeopleList extends StatelessWidget {
  const PeopleList({super.key, required this.name, required this.people});
  final String name;
  final List<Student> people;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextDivider(
          text: name,
          primary: true,
        ),
       ListView.builder(
            primary: false,
            shrinkWrap: true,
            itemCount: people.length,
            itemBuilder: (context, index) {
              return PersonTile(person: people[index]);
            },
          ),
        
      ],
    );
  }
}
