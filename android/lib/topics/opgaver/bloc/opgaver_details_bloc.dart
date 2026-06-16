import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/assignment.dart';

class OpgaveDetailsBloc extends Cubit<Assignment?> {
  final Student student;
  OpgaveDetailsBloc(this.student) : super(null);

  List<Assignment> assignments = [];

  load(AssignmentRef ref) async {
    int indexOfSaved =
        assignments.indexWhere((element) => element.id == ref.id);
    if (indexOfSaved != -1) {
      Assignment assignment = assignments.elementAt(indexOfSaved);
      return emit(assignment);
    }
    var assignment = await student.assignments.get(ref);
    assignments.add(assignment);
    return emit(assignment);
  }
}
