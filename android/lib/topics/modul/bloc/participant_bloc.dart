import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/class.dart';
import 'package:lectio_wrapper/types/context/student.dart';
import 'package:lectio_wrapper/types/message/meta/meta.dart';

class ParticipantsState {
  List<Student> teachers;
  List<Student> students;
  ParticipantsState(this.teachers, this.students);
}

class ParticipantBloc extends Cubit<ParticipantsState?> {
  final Student student;
  final List<MetaDataEntry> teachers;
  final List<MetaDataEntry> teams;
  ParticipantBloc(this.student, this.teachers, this.teams) : super(null) {
    _load();
  }

  _load() async {
    List<Student> fetchedStudents = [];
    List<Student> fetchedTeachers = [];
    for (var teacher in teachers) {
      var teacherContext =
          (await student.context.get(teacher.id)) as StudentContext;
      fetchedTeachers
          .add(Student(teacherContext.id.replaceAll("T", ""), student.gymId)
            ..imageId = teacherContext.imageId
            ..name = teacherContext.name
            ..info = teacher.name
            ..teacher = true);
    }

    for (var team in teams) {
      var fetchedTeam = await student.classes.get(
          ClassRef(name: '', id: team.id.replaceAll("HE", "")),
          group: true);
      fetchedStudents.addAll(fetchedTeam.students);
    }
    emit(ParticipantsState(fetchedTeachers, fetchedStudents));
  }
}
