import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/class.dart';
import 'package:betterlectio/topics/people/widget/person_tile.dart';
import 'package:betterlectio/topics/state/empty.dart';

class StudentList extends StatelessWidget {
  const StudentList({super.key, required this.klasse});
  final Class klasse;
  @override
  Widget build(BuildContext context) {
    if (klasse.students.isEmpty) {
      return const EmptyScreen();
    }
    return ListView.builder(
      itemCount: klasse.students.length,
      itemBuilder: (context, index) {
        var student = klasse.students[index];
        return PersonTile(person: student);
      },
    );
  }
}
